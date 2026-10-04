/**
 * match-sync.int (WP-M, spec M9): `syncPlayers` with the PlayHQ collection mocked writes match rows
 * next to the season rows, records the counters on the run, fetches a corrected scorecard uncached
 * (changed fixture stamp) and replaces its rows, and a match-store failure leaves the season sync
 * `ok` with `matchError` set.
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import { matchTables } from '@/lib/match-store/db'
import { playerTables } from '@/lib/players/db'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetPlayers } from './players-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const B_GRADE = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const ONE_DAY_TEAM = '4398ce96-6b78-48af-8623-c208f8ceca9f'
const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const phq = vi.hoisted(() => ({
  stamps: {} as Record<string, string>,
  raw: {} as Record<string, unknown>,
  calls: [] as { id: string; fresh: boolean | undefined }[],
  fail: new Set<string>(),
}))

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
    getTeamGames: vi.fn(async (t: { id: string }) => {
      const id = t.id === B_GRADE ? twoDay.data.id : oneDay.data.id
      return [{ id, status: 'FINAL', updatedAt: phq.stamps[id] }]
    }),
    getRawGameSummary: vi.fn(async (id: string, opts?: { fresh?: boolean }) => {
      phq.calls.push({ id, fresh: opts?.fresh })
      if (phq.fail.has(id)) throw new Error('PlayHQ timeout')
      return phq.raw[id]
    }),
    isJuniorGrade: vi.fn(() => false),
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>
let payload: Payload

beforeAll(async () => {
  payload = await getTestPayload()
})
afterAll(async () => {
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  phq.stamps = { [twoDay.data.id]: '2025-11-02T00:00:00.000Z', [oneDay.data.id]: '2025-10-26T00:00:00.000Z' }
  phq.raw = { [twoDay.data.id]: clone(twoDay.data), [oneDay.data.id]: clone(oneDay.data) }
  phq.calls = []
  phq.fail = new Set()
  cache.revalidateTag.mockClear()
  await resetPlayers(payload)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const latestRun = async () => (await payload.find({ collection: 'player-sync-runs', sort: '-startedAt', limit: 1, depth: 0 })).docs[0]
const matchRows = async () => {
  const t = matchTables(payload)
  return payload.db.drizzle.select().from(t.matches).orderBy(t.matches.gameId) as Promise<Record<string, unknown>[]>
}
const count = async (table: string) => Number((await payload.db.drizzle.execute(sql.raw(`SELECT count(*)::int AS n FROM "payload"."${table}"`))).rows[0].n)

describe('players sync writes the match store', () => {
  it('the first run stores both games, links club rows to players, records the counters and fetches uncached', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    expect((await syncPlayers(payload)).status).toBe('ok')
    const rows = await matchRows()
    expect(rows.map((r) => r.gameId).sort()).toEqual([oneDay.data.id, twoDay.data.id].sort())
    expect(rows.find((r) => r.gameId === twoDay.data.id)).toMatchObject({ seasonName: 'Summer 2025/26', seasonStartYear: 2025, clubTeamId: B_GRADE, playhqUpdatedAt: '2025-11-02T00:00:00.000Z' })
    expect(await count('match_innings')).toBe(6)
    const t = matchTables(payload)
    const club = (await payload.db.drizzle.select().from(t.match_appearances)).filter((a: R) => a.isClubSide)
    expect(club.length).toBeGreaterThan(10)
    expect(club.every((a: R) => a.player !== null)).toBe(true)
    expect(await latestRun()).toMatchObject({ status: 'ok', matchesUpserted: 2, matchesSkipped: 0, matchMismatches: 0, matchError: 0 })
    expect(phq.calls.every((c) => c.fresh === true)).toBe(true)
  })

  it('a second run with unchanged fixtures fetches from the cache and writes nothing', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const before = await matchRows()
    phq.calls = []
    expect((await syncPlayers(payload)).status).toBe('ok')
    expect(phq.calls).toHaveLength(2)
    expect(phq.calls.every((c) => c.fresh === false)).toBe(true)
    expect(await matchRows()).toEqual(before)
    expect(await latestRun()).toMatchObject({ matchesUpserted: 0, matchesSkipped: 0, matchMismatches: 0, matchError: 0 })
  })

  it('a changed fixture stamp fetches that game uncached; a corrected scorecard replaces its rows and the seasons agree', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const t = matchTables(payload)
    const before = await payload.db.drizzle.select().from(t.match_batting)
    phq.stamps[twoDay.data.id] = '2025-11-09T00:00:00.000Z'
    const corrected = phq.raw[twoDay.data.id] as typeof twoDay.data
    const batter = corrected.periods[0].teams.find((x) => x.discipline === 'BATTING')!.appearances[0]
    batter.statistics.find((s) => s.type === 'TOTAL_RUNS')!.value += 5
    phq.calls = []
    await syncPlayers(payload)
    expect(phq.calls.find((c) => c.id === twoDay.data.id)?.fresh).toBe(true)
    expect(phq.calls.find((c) => c.id === oneDay.data.id)?.fresh).toBe(false)
    expect(cache.revalidateTag).toHaveBeenCalledWith('playhq-game', { expire: 0 })
    const after = await payload.db.drizzle.select().from(t.match_batting)
    expect(after).toHaveLength(before.length)
    const runs = (rows: R[]) => rows.reduce((s, r) => s + Number(r.runs), 0)
    expect(runs(after)).toBe(runs(before) + 5)
    expect((await matchRows()).find((r) => r.gameId === twoDay.data.id)?.playhqUpdatedAt).toBe('2025-11-09T00:00:00.000Z')
    expect(await latestRun()).toMatchObject({ status: 'ok', matchesUpserted: 1, matchMismatches: 0, matchError: 0 })
    // Season rows were rebuilt from the same fresh object.
    const seasons = await payload.db.drizzle.select().from(playerTables(payload).player_seasons)
    expect(seasons.reduce((s: number, r: R) => s + Number(r.batRuns), 0)).toBeGreaterThan(0)
  })

  it('a new stamp on an unchanged scorecard touches only the stamp, so the next run is cached again', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    phq.stamps[oneDay.data.id] = '2025-12-01T00:00:00.000Z'
    await syncPlayers(payload)
    expect(await latestRun()).toMatchObject({ matchesUpserted: 0 })
    phq.calls = []
    await syncPlayers(payload)
    expect(phq.calls.every((c) => c.fresh === false)).toBe(true)
  })

  it('a club-versus-club game is skipped and counted, and both sides of the reconciliation leave it out', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    const derby = phq.raw[oneDay.data.id] as typeof oneDay.data
    derby.teams[0].organisation.id = ORG
    expect((await syncPlayers(payload)).status).toBe('ok')
    expect((await matchRows()).map((r) => r.gameId)).toEqual([twoDay.data.id])
    expect(await latestRun()).toMatchObject({ status: 'ok', matchesUpserted: 1, matchesSkipped: 1, matchMismatches: 0 })
  })

  it('a failing match step still leaves the season sync ok, with matchError set and the season rows committed', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await payload.db.drizzle.execute(sql.raw('ALTER TABLE "payload"."match_batting" RENAME TO "match_batting_off"'))
    try {
      const r = await syncPlayers(payload)
      expect(r.status).toBe('ok')
      expect(r.seasonRows).toBeGreaterThan(0)
    } finally {
      await payload.db.drizzle.execute(sql.raw('ALTER TABLE "payload"."match_batting_off" RENAME TO "match_batting"'))
    }
    const run = await latestRun()
    expect(run.status).toBe('ok')
    expect(run.matchError).toBeGreaterThan(0)
    expect(run.error ?? null).toBeNull()
    expect(await count('player_seasons')).toBeGreaterThan(0)
    expect(await count('matches')).toBe(0) // each game's transaction rolled back as a whole
    // The next healthy run recovers.
    await syncPlayers(payload)
    expect(await count('matches')).toBe(2)
    expect(await latestRun()).toMatchObject({ matchError: 0, matchesUpserted: 2 })
  })

  it('a scorecard that fails to fetch keeps that team-season\'s previous season rows and notes the partial run', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    const t = playerTables(payload)
    const before = (await payload.db.drizzle.select().from(t.player_seasons)) as R[]
    expect(before.some((r) => r.teamId === B_GRADE)).toBe(true)
    phq.fail.add(twoDay.data.id)
    expect((await syncPlayers(payload)).status).toBe('ok')
    const after = (await payload.db.drizzle.select().from(t.player_seasons)) as R[]
    expect(after).toHaveLength(before.length)
    expect(after.filter((r) => r.teamId === B_GRADE).map((r) => r.batRuns).sort()).toEqual(before.filter((r) => r.teamId === B_GRADE).map((r) => r.batRuns).sort())
    const run = await latestRun()
    expect(run.status).toBe('ok')
    expect(run.error).toMatch(/Partial run/)
  })

  it('a team-season whose every listed game became club-versus-club is pruned from the store', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    await syncPlayers(payload)
    expect(await count('matches')).toBe(2)
    ;(phq.raw[oneDay.data.id] as typeof oneDay.data).teams[0].organisation.id = ORG
    await syncPlayers(payload)
    expect((await matchRows()).map((r) => r.gameId)).toEqual([twoDay.data.id])
  })

  it('a run row left running past the lock window (killed by the platform) is closed as an error by the next run', async () => {
    const { syncPlayers } = await import('@/lib/players/sync')
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const t = playerTables(payload)
    await payload.db.drizzle.insert(t.player_sync_runs).values({ status: 'running', startedAt: old, playersCreated: 0, seasonRows: 0, createdAt: old, updatedAt: old })
    expect((await syncPlayers(payload)).status).toBe('ok')
    const rows = (await payload.db.drizzle.select().from(t.player_sync_runs)) as R[]
    const stale = rows.find((r) => new Date(r.startedAt).toISOString() === old)!
    expect(stale.status).toBe('error')
    expect(stale.error).toMatch(/did not finish/)
  })

  it('past the collect deadline unstored scorecards are not fetched and their pairs are partial', async () => {
    const { collectSeniorData } = await import('@/lib/players/sync')
    const data = await collectSeniorData({ stored: new Map(), deadlineAt: 0 })
    expect(data.deferred).toBe(2)
    expect(data.partialPairs).toHaveLength(2)
    expect(data.matches).toHaveLength(0)
    expect(phq.calls).toHaveLength(0)
  })
})
