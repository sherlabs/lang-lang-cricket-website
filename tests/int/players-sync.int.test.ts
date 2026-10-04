/**
 * players-sync.int (spec §15; replaces players-sync): `syncPlayers` against real Postgres with
 * the PlayHQ queries mocked (the raw summaries are the recorded fixtures, mapped by the real
 * `mapScorecard`). Covers a first run and a stable second run, the advisory-lock with two
 * concurrent starts, the stale-lock rule, the wipe guard, a PlayHQ failure leaving players
 * untouched, orphan healing, active flags with the `updated_at` bump, and the drizzle column keys.
 */
import { eq, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import { PLAYER_COLUMN_KEYS, playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetPlayers } from './players-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const B_GRADE = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const ONE_DAY = '4398ce96-6b78-48af-8623-c208f8ceca9f'

const phq = vi.hoisted(() => ({
  fail: false,
  summariesFail: false,
  gate: null as Promise<void> | null,
}))

vi.mock('@/lib/playhq/queries', async () => {
  const group = (name: string, id: string) => ({ name, isJunior: false, status: 'COMPLETED', seasons: [{ id, status: 'COMPLETED', competitionName: 'Seniors', isJunior: false }] })
  const team = (id: string, name: string, gradeName: string) => ({ id, name, seasonId: 's', seasonName: 's', competitionName: 'Seniors', isJunior: false, gradeId: 'g', gradeName })
  return {
    // Newest first: order 0 has no club teams, B Grade is order 1 (active), One Day order 2 (past).
    getSeasonGroups: vi.fn(async () => {
      if (phq.gate) await phq.gate
      if (phq.fail) throw new Error('PlayHQ 503')
      return [group('Summer 2026/27', 's0'), group('Summer 2025/26', 's1'), group('Summer 2024/25', 's2')]
    }),
    getClubTeams: vi.fn(async (g: { seasons: { id: string }[] }) => {
      const id = g.seasons[0].id
      if (id === 's1') return [team(B_GRADE, 'Lang Lang B Grade', 'B Grade')]
      if (id === 's2') return [team(ONE_DAY, 'Lang Lang One Day', 'One Day')]
      return []
    }),
    getTeamGames: vi.fn(async (t: { id: string }) => [{ id: t.id === B_GRADE ? twoDay.data.id : oneDay.data.id, status: 'FINAL' }]),
    getRawGameSummary: vi.fn(async (id: string) => {
      if (phq.summariesFail) throw new Error('summary 500')
      return id === twoDay.data.id ? twoDay.data : oneDay.data
    }),
    isJuniorGrade: vi.fn(() => false),
  }
})

let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
})

afterAll(async () => {
  await destroyTestPayload(payload)
})

beforeEach(async () => {
  phq.fail = false
  phq.summariesFail = false
  phq.gate = null
  await resetPlayers(payload)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function snapshot() {
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const players = await db
    .select({ id: t.players.id, slug: t.players.slug, displayName: t.players.displayName, source: t.players.source, active: t.players.isActiveDerived, updatedAt: t.players.updatedAt })
    .from(t.players)
    .orderBy(t.players.id)
  const aliases = await db.select({ nameKey: t.player_aliases.nameKey, player: t.player_aliases.player }).from(t.player_aliases).orderBy(t.player_aliases.nameKey)
  const seasons = await db.select().from(t.player_seasons)
  const key = (r: Record<string, unknown>) => `${r.player}|${r.teamId}`
  const seasonRows = seasons
    .map((r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k))))
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => key(a).localeCompare(key(b)))
  return { players, aliases, seasonRows }
}

describe('players sync', () => {
  it('uses only drizzle column keys that exist (camelCase field names, not SQL names)', () => {
    const t = playerTables(payload)
    for (const [table, keys] of Object.entries(PLAYER_COLUMN_KEYS)) {
      expect(t[table as keyof typeof t], table).toBeDefined()
      for (const k of keys) expect(t[table as keyof typeof t][k], `${table}.${k}`).toBeDefined()
    }
    expect(t.player_aliases.name_key).toBeUndefined()
  })

  it('a first run creates players, aliases and seasons; a second run is stable', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    const first = await syncPlayers(payload)
    expect(first.status).toBe('ok')
    expect(first.playersCreated).toBeGreaterThan(5)
    const a = await snapshot()
    expect(a.players).toHaveLength(first.playersCreated)
    expect(a.aliases).toHaveLength(first.playersCreated)
    expect(a.seasonRows).toHaveLength(first.seasonRows)
    for (const p of a.players) {
      expect(p.source).toBe('playhq')
      expect(p.displayName).toMatch(/\S \S/)
      expect(p.slug).toMatch(/^[a-z0-9-]+$/)
    }
    // Active = played in season order ≤ 1 (B Grade); One Day only (order 2) = past.
    const bGradeIds = new Set(a.seasonRows.filter((r) => r.teamId === B_GRADE).map((r) => r.player))
    for (const p of a.players) expect(p.active).toBe(bGradeIds.has(p.id))
    expect(a.players.some((p) => !p.active)).toBe(true)

    const runs = await payload.find({ collection: 'player-sync-runs', sort: '-startedAt', depth: 0 })
    expect(runs.docs[0]).toMatchObject({ status: 'ok', playersCreated: first.playersCreated, seasonRows: first.seasonRows })
    expect(runs.docs[0].finishedAt).toBeTruthy()
    expect(cache.revalidatePath).toHaveBeenCalledWith('/players/[slug]', 'page')

    // Admin-edited fields survive the next run.
    await payload.update({ collection: 'players', id: a.players[0].id, data: { bio: 'Edited.', hidden: true }, context: { disableRevalidate: true } })
    const editedAt = (await snapshot()).players[0].updatedAt

    const second = await syncPlayers(payload)
    expect(second).toEqual({ status: 'ok', playersCreated: 0, seasonRows: first.seasonRows })
    const b = await snapshot()
    expect(b.aliases).toEqual(a.aliases)
    expect(b.seasonRows).toEqual(a.seasonRows)
    expect(b.players.map((p) => [p.id, p.slug, p.active])).toEqual(a.players.map((p) => [p.id, p.slug, p.active]))
    // No active flag changed, so no updated_at was bumped.
    expect(b.players[0].updatedAt).toBe(editedAt)
    expect(b.players.slice(1).map((p) => p.updatedAt)).toEqual(a.players.slice(1).map((p) => p.updatedAt))
    expect(await payload.findByID({ collection: 'players', id: a.players[0].id, depth: 0, joins: false })).toMatchObject({ bio: 'Edited.', hidden: true })
  })

  it('bumps updated_at only for players whose active flag changed', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const before = await snapshot()
    const flipped = before.players.find((p) => p.active)!
    const t = playerTables(payload)
    const old = '2020-01-01T00:00:00.000Z'
    await payload.db.drizzle.update(t.players).set({ isActiveDerived: false, updatedAt: old })
    await syncPlayers(payload)
    const after = await snapshot()
    const iso = (v: string) => new Date(v).toISOString()
    for (const p of after.players) {
      const was = before.players.find((x) => x.id === p.id)!
      expect(p.active).toBe(was.active)
      if (was.active) expect(iso(p.updatedAt)).not.toBe(old)
      else expect(iso(p.updatedAt)).toBe(old)
    }
    expect(iso(after.players.find((p) => p.id === flipped.id)!.updatedAt)).not.toBe(old)
  })

  it('two concurrent starts: one runs, the other returns locked', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    let release!: () => void
    phq.gate = new Promise<void>((r) => (release = r))
    const p1 = syncPlayers(payload)
    const p2 = syncPlayers(payload)
    // The loser returns as soon as it sees the winner's `running` row.
    const firstDone = await Promise.race([p1, p2])
    expect(firstDone.status).toBe('locked')
    release()
    const results = await Promise.all([p1, p2])
    expect(results.map((r) => r.status).sort()).toEqual(['locked', 'ok'])
    const runs = await payload.find({ collection: 'player-sync-runs', depth: 0 })
    expect(runs.docs.map((r) => r.status)).toEqual(['ok'])
  })

  it('a running row older than 10 minutes does not lock; a fresh one does', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    const t = playerTables(payload)
    const now = new Date('2026-10-03T10:00:00.000Z')
    const stale = new Date(now.getTime() - 11 * 60_000).toISOString()
    await payload.db.drizzle.insert(t.player_sync_runs).values({ status: 'running', startedAt: stale, createdAt: stale, updatedAt: stale })
    expect((await syncPlayers(payload, now)).status).toBe('ok')
    const fresh = new Date(now.getTime() + 60_000)
    await payload.db.drizzle.insert(t.player_sync_runs).values({ status: 'running', startedAt: fresh.toISOString(), createdAt: fresh.toISOString(), updatedAt: fresh.toISOString() })
    expect(await syncPlayers(payload, new Date(fresh.getTime() + 60_000))).toEqual({ status: 'locked', playersCreated: 0, seasonRows: 0 })
  })

  it('a PlayHQ failure records an error and leaves players and seasons untouched', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const before = await snapshot()
    phq.fail = true
    const r = await syncPlayers(payload)
    expect(r).toMatchObject({ status: 'error', error: 'PlayHQ 503' })
    expect(await snapshot()).toEqual(before)
    const latest = (await payload.find({ collection: 'player-sync-runs', sort: '-startedAt', limit: 1, depth: 0 })).docs[0]
    expect(latest).toMatchObject({ status: 'error', error: 'PlayHQ 503' })
  })

  it('when every scorecard fails the existing seasons are kept untouched and the run notes it was partial', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const before = await snapshot()
    phq.summariesFail = true
    const r = await syncPlayers(payload)
    expect(r.status).toBe('ok')
    expect(await snapshot()).toEqual(before)
    const latest = (await payload.find({ collection: 'player-sync-runs', sort: '-startedAt', limit: 1, depth: 0 })).docs[0]
    expect(latest.error).toMatch(/Partial run/)
  })

  it('heals a PlayHQ player whose alias is missing instead of creating a duplicate', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const before = await snapshot()
    const t = playerTables(payload)
    const victim = before.aliases[0]
    await payload.db.drizzle.delete(t.player_aliases).where(eq(t.player_aliases.nameKey, victim.nameKey))
    const r = await syncPlayers(payload)
    expect(r.playersCreated).toBe(0)
    const after = await snapshot()
    expect(after.players).toHaveLength(before.players.length)
    expect(after.aliases).toEqual(before.aliases)
  })

  it('seasons of an identity merged into a manual player land on that player', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const before = await snapshot()
    const victim = before.players.find((p) => p.active)!
    const manual = await payload.create({ collection: 'players', data: { firstName: 'Legend', lastName: 'Keeper' }, context: { disableRevalidate: true } })
    const t = playerTables(payload)
    // What the merge endpoint does to the identity.
    await payload.db.drizzle.update(t.player_aliases).set({ player: manual.id }).where(eq(t.player_aliases.player, victim.id))
    await payload.db.drizzle.execute(sql`DELETE FROM "payload"."player_seasons" WHERE player_id = ${victim.id}`)
    await payload.db.drizzle.delete(t.players).where(eq(t.players.id, victim.id))
    expect((await syncPlayers(payload)).playersCreated).toBe(0)
    const seasons = await payload.find({ collection: 'player-seasons', where: { player: { equals: manual.id } }, depth: 0 })
    expect(seasons.totalDocs).toBeGreaterThan(0)
    expect(await payload.findByID({ collection: 'players', id: manual.id, depth: 0, joins: false })).toMatchObject({ source: 'manual', isActiveDerived: true })
  })
})
