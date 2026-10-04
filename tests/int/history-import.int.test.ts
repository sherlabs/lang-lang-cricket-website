/**
 * history-import.int (W2 spec 6.1, 6.10): preview writes nothing, apply is atomic and idempotent, a double-header imports as two
 * games, a sync run afterwards leaves imported season and match rows intact (and the first sync is not refused because the only rows
 * are imports), an export re-imports as a no-op, undo-batch removes one import, and only an admin can call any of it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import { applyImport, exportMatchRows, exportSeasonTotals, listImportBatches, planImport, undoImportBatch } from '@/lib/history-import/server'
import { isImportedSeasonOrder } from '@/lib/history-import/constants'
import { matchTables } from '@/lib/match-store/db'
import { destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetPlayers } from './players-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const writes = vi.hoisted(() => ({ failOnCall: 0, calls: 0 }))
vi.mock('@/lib/match-store/write', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/match-store/write')>()
  return {
    ...orig,
    writeBundle: vi.fn(async (...args: Parameters<typeof orig.writeBundle>) => {
      writes.calls++
      if (writes.failOnCall && writes.calls === writes.failOnCall) throw new Error('simulated write failure')
      return orig.writeBundle(...args)
    }),
  }
})

const B_GRADE = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const ONE_DAY_TEAM = '4398ce96-6b78-48af-8623-c208f8ceca9f'
vi.mock('@/lib/playhq/queries', async () => {
  const group = (name: string, id: string) => ({ name, isJunior: false, status: 'COMPLETED', seasons: [{ id, status: 'COMPLETED', competitionName: 'Seniors', isJunior: false }] })
  const team = (id: string, name: string, gradeName: string) => ({ id, name, seasonId: 's', seasonName: 's', competitionName: 'Seniors', isJunior: false, gradeId: 'g', gradeName })
  return {
    getSeasonGroups: vi.fn(async () => [group('Summer 2026/27', 's0'), group('Summer 2025/26', 's1'), group('Summer 2024/25', 's2')]),
    getClubTeams: vi.fn(async (g: { seasons: { id: string }[] }) => {
      const id = g.seasons[0].id
      if (id === 's1') return [team(B_GRADE, 'Lang Lang B Grade', 'B Grade')]
      if (id === 's2') return [team(ONE_DAY_TEAM, 'Lang Lang One Day', 'One Day')]
      return []
    }),
    getTeamGames: vi.fn(async (t: { id: string }) => [{ id: t.id === B_GRADE ? twoDay.data.id : oneDay.data.id, status: 'FINAL', updatedAt: '2025-11-02T00:00:00.000Z' }]),
    getRawGameSummary: vi.fn(async (id: string) => JSON.parse(JSON.stringify(id === twoDay.data.id ? twoDay.data : oneDay.data))),
    isJuniorGrade: vi.fn(() => false),
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
const fx = (name: string) => readFileSync(path.resolve(__dirname, '../fixtures/history-import', name), 'utf8')
const SEASONS = fx('season-totals-valid.csv')
const MATCHES = fx('match-rows-valid.csv')

let payload: Payload
beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetPlayers(payload)
  writes.failOnCall = 0
  writes.calls = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const rows = (table: string) => payload.db.drizzle.execute(sql.raw(`SELECT * FROM "payload"."${table}"`)).then((r) => r.rows as R[])
const count = async (table: string) => (await rows(table)).length

describe('season totals', () => {
  it('a preview reads and writes nothing', async () => {
    const res = await planImport(payload, 'season-totals', SEASONS, true)
    expect(res.ok && res.plan.summary).toMatchObject({ create: 3, update: 0, unchanged: 0, errors: 0 })
    expect(await count('player_seasons')).toBe(0)
    expect(await count('players')).toBe(0)
  })

  it('unknown names are refused unless new players are allowed', async () => {
    const res = await applyImport(payload, 'season-totals', SEASONS, { createUnknown: false })
    expect(res.ok).toBe(false)
    expect(await count('player_seasons')).toBe(0)
  })

  it('applies tagged rows, creates manual players with aliases, and re-applying is unchanged', async () => {
    const first = await applyImport(payload, 'season-totals', SEASONS, { createUnknown: true })
    expect(first).toMatchObject({ ok: true, created: 3, updated: 0, unchanged: 0, playersCreated: 2 })
    const seasons = await rows('player_seasons')
    expect(seasons).toHaveLength(3)
    expect(seasons.every((s) => s.source === 'import' && s.import_batch === (first as { batch: string }).batch)).toBe(true)
    expect(seasons.every((s) => isImportedSeasonOrder(Number(s.season_order)))).toBe(true)
    expect(seasons.find((s) => s.season_name === '2012/13' && s.team_name === 'Demo B Grade')).toMatchObject({ bat_runs_unballed: '205', bat_balls: '0', season_start_year: '2012' })
    const players = await rows('players')
    expect(players.map((p) => p.source)).toEqual(['manual', 'manual'])
    expect(players.every((p) => p.hidden === false && p.is_active_derived === false)).toBe(true)
    expect((await rows('player_aliases')).map((a) => a.name_key).sort()).toEqual(['alex|demoson', 'sam|tester'])

    const again = await applyImport(payload, 'season-totals', SEASONS, { createUnknown: true })
    expect(again).toMatchObject({ ok: true, created: 0, updated: 0, unchanged: 3, playersCreated: 0 })
    expect(await count('player_seasons')).toBe(3)
    expect(await count('players')).toBe(2)
  })

  it('a corrected number updates the row in place', async () => {
    await applyImport(payload, 'season-totals', SEASONS, { createUnknown: true })
    const fixed = SEASONS.replace('2012/13,Demo A Grade,Demo A Grade,Alex,Demoson,14,13,2,412', '2012/13,Demo A Grade,Demo A Grade,Alex,Demoson,14,13,2,420')
    const res = await applyImport(payload, 'season-totals', fixed, { createUnknown: true })
    expect(res).toMatchObject({ ok: true, created: 0, updated: 1, unchanged: 2 })
    expect((await rows('player_seasons')).find((s) => s.season_name === '2012/13' && s.team_name === 'Demo A Grade')!.bat_runs).toBe('420')
  })

  it('a file with errors writes nothing and lists the rows', async () => {
    const errors = fx('season-totals-errors.csv')
    const preview = await planImport(payload, 'season-totals', errors, true)
    expect(preview.ok && preview.plan.rowErrors.length).toBeGreaterThan(5)
    const res = await applyImport(payload, 'season-totals', errors, { createUnknown: true })
    expect(res.ok).toBe(false)
    expect(await count('player_seasons')).toBe(0)
    expect(await count('players')).toBe(0)
  })

  it('refuses when the file changed since the preview', async () => {
    const preview = await planImport(payload, 'season-totals', SEASONS, true)
    const res = await applyImport(payload, 'season-totals', SEASONS + '\n', { createUnknown: true, expectedHash: preview.ok ? preview.fileHash : null })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('Preview it again')
  })
})

describe('match rows', () => {
  it('imports a double-header as two games with club appearances only', async () => {
    const res = await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })
    expect(res).toMatchObject({ ok: true, created: 4, unchanged: 0, playersCreated: 3 })
    const t = matchTables(payload)
    const matches = (await payload.db.drizzle.select().from(t.matches)) as R[]
    expect(matches).toHaveLength(4)
    expect(matches.every((m) => m.source === 'import' && m.status === 'FINAL' && String(m.gameId).startsWith('imp:'))).toBe(true)
    expect(matches.filter((m) => m.localDate === '2013-02-16')).toHaveLength(2)
    const apps = (await payload.db.drizzle.select().from(t.match_appearances)) as R[]
    expect(apps.every((a) => a.isClubSide === true && a.player !== null)).toBe(true)
    const innings = (await payload.db.drizzle.select().from(t.match_innings)) as R[]
    expect(innings.every((i) => i.hasBallData === false && i.hasFallOfWickets === false)).toBe(true)
    // No total given: stored as NULL, not 0.
    const twoDayMatch = matches.find((m) => m.type === 'twoDay')!
    expect(innings.find((i) => i.match === twoDayMatch.id && i.sequenceNo === 1)!.totalRuns).toBeNull()
  })

  it('re-applying is unchanged and the export re-imports as a no-op', async () => {
    await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })
    expect(await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })).toMatchObject({ ok: true, created: 0, updated: 0, unchanged: 4 })
    const exported = await exportMatchRows(payload)
    const again = await planImport(payload, 'match-rows', exported, false)
    expect(again.ok && again.plan.rowErrors).toEqual([])
    expect(again.ok && again.plan.summary).toMatchObject({ create: 0, update: 0, unchanged: 4 })
  })

  it('season-totals export re-imports as a no-op, with the source column and PlayHQ rows skipped', async () => {
    await applyImport(payload, 'season-totals', SEASONS, { createUnknown: true })
    const exported = await exportSeasonTotals(payload)
    expect(exported.split('\r\n')[0].endsWith(',source,hidden')).toBe(true)
    const again = await planImport(payload, 'season-totals', exported, false)
    expect(again.ok && again.plan.rowErrors).toEqual([])
    expect(again.ok && again.plan.summary).toMatchObject({ create: 0, update: 0, unchanged: 3 })
  })

  it('is atomic: a failure on the third game leaves nothing behind, including new players', async () => {
    writes.failOnCall = 3
    await expect(applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })).rejects.toThrow('simulated write failure')
    expect(await count('matches')).toBe(0)
    expect(await count('players')).toBe(0)
    expect(await count('player_aliases')).toBe(0)
  })

  it('a game PlayHQ already has is an error', async () => {
    await payload.db.drizzle.execute(
      sql.raw(`INSERT INTO "payload"."matches" (game_id, status, local_date, opponent_org_name, source, club_team_id, club_team_name, season_name, updated_at, created_at) VALUES ('phq-1','FINAL','2013-02-09','Demo Rovers','playhq','t','T','Summer 2012/13', now(), now())`),
    )
    const res = await planImport(payload, 'match-rows', MATCHES, true)
    expect(res.ok && res.plan.overlaps).toHaveLength(1)
    expect((await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })).ok).toBe(false)
  })
})

describe('imported games feed the match statistics', () => {
  it('derive batting, bowling and results, with unrecorded detail left as n/a', async () => {
    await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })
    const { readStoredBundles } = await import('@/lib/match-store/read')
    const { deriveFacts, assembleFacts } = await import('@/lib/stats/match/facts')
    const visible = new Set((await rows('players')).map((p) => Number(p.id)))
    const bundles = await readStoredBundles(payload, { source: 'import' })
    expect(bundles).toHaveLength(4)
    const set = assembleFacts(bundles.flatMap((b) => deriveFacts(b, visible) ?? []))
    expect(set.matches.size).toBe(4)
    expect(set.bat.length).toBeGreaterThanOrEqual(7)
    expect(set.bat.every((b) => b.pos === 0)).toBe(true)
    expect(set.bowl.length).toBe(3)
    expect(set.credits).toEqual([])
    expect([...set.innings.values()].every((i) => i.hasFow === false && i.hasBall === false)).toBe(true)
  })
})

describe('the sync never touches imports', () => {
  it('keeps imported seasons and games, sorts them below PlayHQ and leaves active flags alone', async () => {
    await applyImport(payload, 'season-totals', SEASONS, { createUnknown: true })
    await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })
    const importedMatches = await count('matches')
    // Only imports exist: the first sync is not refused by the wipe guard.
    const { syncPlayers } = await import('@/lib/players/sync')
    const res = await syncPlayers(payload)
    expect(res.status).toBe('ok')
    const seasons = await rows('player_seasons')
    expect(seasons.filter((s) => s.source === 'import')).toHaveLength(3)
    expect(seasons.filter((s) => s.source === 'playhq').length).toBeGreaterThan(0)
    expect(Math.min(...seasons.filter((s) => s.source === 'import').map((s) => Number(s.season_order)))).toBeGreaterThan(Math.max(...seasons.filter((s) => s.source === 'playhq').map((s) => Number(s.season_order))))
    const matches = await rows('matches')
    expect(matches.filter((m) => m.source === 'import')).toHaveLength(importedMatches)
    expect(matches.filter((m) => m.source === 'playhq').length).toBe(2)
    const demo = (await rows('players')).filter((p) => ['alex', 'sam', 'jo'].includes(String(p.first_name).toLowerCase()))
    expect(demo.every((p) => p.is_active_derived === false)).toBe(true)
    // A second run is steady.
    expect((await syncPlayers(payload)).status).toBe('ok')
    expect((await rows('player_seasons')).filter((s) => s.source === 'import')).toHaveLength(3)
    expect((await rows('player_sync_runs')).every((r) => r.status === 'ok')).toBe(true)
    // The reconciliation compares PlayHQ games only: imports do not make it mismatch.
    const [run] = (await rows('player_sync_runs')).sort((a, b) => b.id - a.id)
    expect(Number(run.match_mismatches)).toBe(0)
  })

  it('refuses an imported season that PlayHQ now covers for the same player', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const [s] = (await rows('player_seasons')).filter((r) => r.source === 'playhq')
    const player = (await rows('players')).find((p) => p.id === s.player_id)!
    const year = /\d{4}/.exec(String(s.season_name))![0]
    const csv = `season,team,first_name,last_name,games\n${year}/${String((Number(year) + 1) % 100).padStart(2, '0')},Other Team,${player.first_name},${player.last_name},3\n`
    const res = await planImport(payload, 'season-totals', csv, false)
    expect(res.ok && res.plan.overlaps).toHaveLength(1)
  })
})

describe('undo of an import', () => {
  it('deletes only the rows of that batch', async () => {
    const a = (await applyImport(payload, 'season-totals', SEASONS, { createUnknown: true })) as { batch: string }
    await new Promise((r) => setTimeout(r, 1100))
    const b = (await applyImport(payload, 'match-rows', MATCHES, { createUnknown: true })) as { batch: string }
    expect(a.batch).not.toBe(b.batch)
    const log = await listImportBatches(payload)
    expect(log.map((l) => l.batch).sort()).toEqual([a.batch, b.batch].sort())
    expect(await undoImportBatch(payload, b.batch)).toEqual({ seasons: 0, matches: 4 })
    expect(await count('matches')).toBe(0)
    expect(await count('match_appearances')).toBe(0)
    expect(await count('player_seasons')).toBe(3)
    expect(await undoImportBatch(payload, a.batch)).toEqual({ seasons: 3, matches: 0 })
    await expect(undoImportBatch(payload, "x'; drop")).rejects.toThrow()
  })
})

describe('only an admin can call the import endpoints', () => {
  it('anonymous 401, editor 403, admin ok', async () => {
    const editor = await tokenFor(payload, 'editor')
    const admin = await tokenFor(payload, 'admin')
    for (const [method, url, body] of [
      ['GET', '/history-import/template/season-totals', undefined],
      ['GET', '/history-import/export/season-totals', undefined],
      ['GET', '/history-import/batches', undefined],
      ['POST', '/history-import/preview', { kind: 'season-totals', csv: SEASONS }],
      ['POST', '/history-import/apply', { kind: 'season-totals', csv: SEASONS, createUnknown: true }],
      ['POST', '/history-import/undo-batch', { batch: 'imp-1' }],
    ] as const) {
      expect((await rest(method, url, { body })).status, `${url} anonymous`).toBe(401)
      expect((await rest(method, url, { body, token: editor })).status, `${url} editor`).toBe(403)
    }
    expect((await rest('GET', '/history-import/template/match-rows', { token: admin })).status).toBe(200)
    const preview = await rest('POST', '/history-import/preview', { body: { kind: 'season-totals', csv: SEASONS, createUnknown: true }, token: admin })
    expect(preview.status).toBe(200)
    expect(preview.json.summary).toMatchObject({ create: 3 })
    expect(preview.json.ops).toBeUndefined()
    const applied = await rest('POST', '/history-import/apply', { body: { kind: 'season-totals', csv: SEASONS, createUnknown: true, fileHash: preview.json.fileHash }, token: admin })
    expect(applied.status).toBe(200)
    expect(await count('player_seasons')).toBe(3)
    const bad = await rest('POST', '/history-import/preview', { body: { kind: 'nope', csv: 1 }, token: admin })
    expect(bad.status).toBe(400)
  })
})
