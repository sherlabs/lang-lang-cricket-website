import { describe, expect, it } from 'vitest'
import { DEFAULT_DELAY_MS, DEFAULT_MAX_CONSECUTIVE_FAILURES, estimateSeconds, failedReport, parseBackfillArgs, planBackfill, runGames, selectSeasons, StopRun, type FixtureGame, type StoredStamp } from '@/lib/match-store/backfill'
import { PlayHQError } from '@/lib/playhq/client'

describe('parseBackfillArgs', () => {
  it('defaults to a dry run with the safe delay', () => {
    expect(parseBackfillArgs(['--target', '127.0.0.1/langlang_dev'])).toEqual({
      apply: false, seasons: [], since: null, limit: null, teamId: null, delayMs: DEFAULT_DELAY_MS, logPath: null, force: false,
      continueOnError: false, maxConsecutiveFailures: DEFAULT_MAX_CONSECUTIVE_FAILURES, skipGames: [],
    })
  })
  it('reads every option, including repeated seasons and = forms; the guard flags are ignored here', () => {
    const a = parseBackfillArgs(['--', '--target', 'h/db', '--apply', '--confirm', '--season', '2025/26', '--season=2024/25', '--since', '2025-10-01', '--limit', '3', '--team=t1', '--delay-ms', '2000', '--log', 'x.log', '--force', '--continue-on-error', '--max-consecutive-failures', '3', '--skip-game', 'g1', '--skip-game=g2'])
    expect(a).toEqual({ apply: true, seasons: ['2025/26', '2024/25'], since: '2025-10-01', limit: 3, teamId: 't1', delayMs: 2000, logPath: 'x.log', force: true, continueOnError: true, maxConsecutiveFailures: 3, skipGames: ['g1', 'g2'] })
  })
  it('enforces the delay minimum', () => {
    expect(() => parseBackfillArgs(['--delay-ms', '499'])).toThrow(/at least 500/)
    expect(() => parseBackfillArgs(['--delay-ms', '0'])).toThrow(/at least 500/)
    expect(() => parseBackfillArgs(['--delay-ms', 'fast'])).toThrow(/at least 500/)
    expect(parseBackfillArgs(['--delay-ms', '500']).delayMs).toBe(500)
  })
  it('rejects bad values and unknown options instead of ignoring them', () => {
    expect(() => parseBackfillArgs(['--since', '01/10/2025'])).toThrow(/--since/)
    expect(() => parseBackfillArgs(['--since', '2025-13-45'])).toThrow(/--since/)
    expect(() => parseBackfillArgs(['--limit', '0'])).toThrow(/--limit/)
    expect(() => parseBackfillArgs(['--limit', '1.5'])).toThrow(/--limit/)
    expect(() => parseBackfillArgs(['--season'])).toThrow(/needs a value/)
    expect(() => parseBackfillArgs(['--season', '--apply'])).toThrow(/needs a value/)
    expect(() => parseBackfillArgs(['--max-consecutive-failures', '0'])).toThrow(/--max-consecutive-failures/)
    expect(() => parseBackfillArgs(['--skip-game'])).toThrow(/needs a value/)
    expect(() => parseBackfillArgs(['--parallel', '5'])).toThrow(/Unknown option --parallel/)
  })
})

describe('selectSeasons', () => {
  const names = ['Summer 2026/27', 'Summer 2025/26', 'Summer 2024/25']
  it('selects all, an exact name, or a part of one', () => {
    expect(selectSeasons(names, [])).toEqual(names)
    expect(selectSeasons(names, ['Summer 2025/26'])).toEqual(['Summer 2025/26'])
    expect(selectSeasons(names, ['2025/26'])).toEqual(['Summer 2025/26'])
    expect(selectSeasons(names, ['2025/26', '2024/25'])).toEqual(['Summer 2025/26', 'Summer 2024/25'])
    expect(selectSeasons(names, ['1999/00'])).toEqual([])
  })
})

const fx = (id: string, over: Partial<FixtureGame['game']> = {}, team = 't1', season = 'Summer 2025/26'): FixtureGame => ({
  seasonName: season, teamId: team, teamName: team.toUpperCase(),
  game: { id, status: 'FINAL', updatedAt: `stamp-${id}`, localDate: '2025-11-01', ...over },
})
const stored = (entries: Record<string, StoredStamp>) => new Map(Object.entries(entries))
const none = { since: null, limit: null, teamId: null, force: false }

describe('planBackfill', () => {
  it('fetches FINAL games that are new, and ignores games that are not FINAL', () => {
    const plan = planBackfill([fx('a'), fx('b', { status: 'UPCOMING' }), fx('c', { status: 'ABANDONED' })], stored({}), none)
    expect(plan.toFetch.map((f) => f.game.id)).toEqual(['a'])
    expect(plan.upToDate).toEqual([])
  })
  it('skips a game whose stored stamp equals the fixture stamp and refetches a changed one', () => {
    const plan = planBackfill([fx('a'), fx('b'), fx('c')], stored({
      a: { playhqUpdatedAt: 'stamp-a', sourceHash: 'h' },
      b: { playhqUpdatedAt: 'older', sourceHash: 'h' },
      c: { playhqUpdatedAt: 'stamp-c', sourceHash: null },
    }), none)
    expect(plan.upToDate.map((f) => f.game.id)).toEqual(['a'])
    expect(plan.toFetch.map((f) => f.game.id)).toEqual(['b', 'c'])
  })
  it('a game with no fixture stamp is always fetched (nothing proves it is current)', () => {
    const plan = planBackfill([fx('a', { updatedAt: null })], stored({ a: { playhqUpdatedAt: null, sourceHash: 'h' } }), none)
    expect(plan.toFetch).toHaveLength(1)
  })
  it('a second run after a complete first run fetches nothing (idempotent, resumable)', () => {
    const fixtures = [fx('a'), fx('b'), fx('c')]
    const first = planBackfill(fixtures, stored({}), { ...none, limit: 2 })
    expect(first.toFetch.map((f) => f.game.id)).toEqual(['a', 'b'])
    expect(first.deferred.map((f) => f.game.id)).toEqual(['c'])
    const db = stored({ a: { playhqUpdatedAt: 'stamp-a', sourceHash: 'h' }, b: { playhqUpdatedAt: 'stamp-b', sourceHash: 'h' } })
    const second = planBackfill(fixtures, db, { ...none, limit: 2 })
    expect(second.toFetch.map((f) => f.game.id)).toEqual(['c'])
    const third = planBackfill(fixtures, stored({ ...Object.fromEntries(db), c: { playhqUpdatedAt: 'stamp-c', sourceHash: 'h' } }), none)
    expect(third.toFetch).toEqual([])
    expect(third.upToDate).toHaveLength(3)
  })
  it('--force refetches stored games', () => {
    const db = stored({ a: { playhqUpdatedAt: 'stamp-a', sourceHash: 'h' } })
    expect(planBackfill([fx('a')], db, { ...none, force: true }).toFetch).toHaveLength(1)
  })
  it('filters by team and by local date, and counts per season and team', () => {
    const plan = planBackfill(
      [fx('a'), fx('b', { localDate: '2025-09-01' }), fx('c', {}, 't2'), fx('d', {}, 't1', 'Summer 2024/25')],
      stored({ a: { playhqUpdatedAt: 'stamp-a', sourceHash: 'h' } }),
      { ...none, since: '2025-10-01' },
    )
    expect(plan.toFetch.map((f) => f.game.id)).toEqual(['c', 'd'])
    expect(plan.groups).toEqual([
      { seasonName: 'Summer 2025/26', teamId: 't1', teamName: 'T1', fetch: 0, skip: 1, excluded: 0 },
      { seasonName: 'Summer 2025/26', teamId: 't2', teamName: 'T2', fetch: 1, skip: 0, excluded: 0 },
      { seasonName: 'Summer 2024/25', teamId: 't1', teamName: 'T1', fetch: 1, skip: 0, excluded: 0 },
    ])
    expect(planBackfill([fx('a'), fx('c', {}, 't2')], stored({}), { ...none, teamId: 't2' }).toFetch.map((f) => f.game.id)).toEqual(['c'])
  })
  it('--skip-game leaves known-bad games out of the plan, so they are never requested', () => {
    const plan = planBackfill([fx('a'), fx('bad'), fx('c', {}, 't2')], stored({}), { ...none, skipGames: ['bad'] })
    expect(plan.toFetch.map((f) => f.game.id)).toEqual(['a', 'c'])
    expect(plan.excluded.map((f) => f.game.id)).toEqual(['bad'])
    expect(plan.groups[0]).toMatchObject({ teamId: 't1', fetch: 1, skip: 0, excluded: 1 })
    expect(planBackfill([fx('a')], stored({}), { ...none, skipGames: ['other'] }).excluded).toEqual([])
  })
  it('lists a game that appears under two teams once', () => {
    expect(planBackfill([fx('a'), fx('a', {}, 't2')], stored({}), none).toFetch).toHaveLength(1)
  })
})

describe('estimateSeconds', () => {
  it('is requests times delay, rounded up', () => {
    expect(estimateSeconds(10, 1500)).toBe(15)
    expect(estimateSeconds(3, 500)).toBe(2)
  })
})

describe('runGames (the per-game failure handling)', () => {
  const games = (n: number) => Array.from({ length: n }, (_, i) => fx(`g${i + 1}`))
  const ids = (list: { gameId: string }[]) => list.map((x) => x.gameId)
  const opts = { continueOnError: false, maxConsecutiveFailures: 5 }
  const on = { continueOnError: true, maxConsecutiveFailures: 5 }
  /** A mocked fetcher: a map of game id to the error it rejects with; the rest resolve. */
  function harness(errors: Record<string, unknown> = {}, storeErrors: Record<string, unknown> = {}) {
    const requested: string[] = []
    const stored: string[] = []
    return {
      requested, stored,
      deps: {
        fetchGame: async (f: FixtureGame) => {
          requested.push(f.game.id)
          if (f.game.id in errors) throw errors[f.game.id]
          return { id: f.game.id }
        },
        storeGame: async (f: FixtureGame) => {
          if (f.game.id in storeErrors) throw storeErrors[f.game.id]
          stored.push(f.game.id)
        },
      },
    }
  }
  const err500 = () => new PlayHQError(500, '/v2/games/x/summary')

  it('default: the first 5xx stops the run and nothing after it is requested', async () => {
    const h = harness({ g2: err500() })
    const r = await runGames(games(4), opts, h.deps)
    expect(r.stopped).toMatch(/PlayHQ 500/)
    expect(h.requested).toEqual(['g1', 'g2'])
    expect(h.stored).toEqual(['g1'])
    expect(r.failed).toEqual([])
  })
  it('default: a game that fails to map is recorded and the run goes on (unchanged behaviour)', async () => {
    const h = harness({}, { g2: new Error('bad shape') })
    const r = await runGames(games(3), opts, h.deps)
    expect(r.stopped).toBeNull()
    expect(ids(r.failed)).toEqual(['g2'])
    expect(h.stored).toEqual(['g1', 'g3'])
  })
  it('--continue-on-error: continues past a 500, records it with season, team, date and status, never stores it', async () => {
    const h = harness({ g2: err500() })
    const seen: string[] = []
    const r = await runGames(games(3), on, { ...h.deps, onFailed: (x) => seen.push(x.gameId) })
    expect(r.stopped).toBeNull()
    expect(h.requested).toEqual(['g1', 'g2', 'g3'])
    expect(h.stored).toEqual(['g1', 'g3'])
    expect(seen).toEqual(['g2'])
    expect(r.failed).toEqual([{ gameId: 'g2', seasonName: 'Summer 2025/26', teamId: 't1', teamName: 'T1', localDate: '2025-11-01', status: 500, error: 'PlayHQ 500 for /v2/games/x/summary' }])
  })
  it('--continue-on-error tolerates 500, 502, 503 and 504, and a body that fails to map', async () => {
    const h = harness({ g1: new PlayHQError(502, 'p'), g2: new PlayHQError(503, 'p'), g3: new PlayHQError(504, 'p'), g4: err500() }, { g5: new TypeError('cannot read innings') })
    const r = await runGames(games(6), { continueOnError: true, maxConsecutiveFailures: 6 }, h.deps)
    expect(r.stopped).toBeNull()
    expect(ids(r.failed)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
    expect(r.failed.at(-1)?.status).toBeNull()
    expect(h.stored).toEqual(['g6'])
  })
  it('--continue-on-error still stops at once on 429, a throttle StopRun, an unset or rejected key', async () => {
    for (const e of [new PlayHQError(429, 'p'), new StopRun('PlayHQ answered 429'), new PlayHQError(0, 'PLAYHQ_CLIENT_ID not set'), new PlayHQError(401, 'p'), new PlayHQError(403, 'p')]) {
      const h = harness({ g2: e })
      const r = await runGames(games(4), on, h.deps)
      expect(r.stopped).toBeTruthy()
      expect(h.requested).toEqual(['g1', 'g2'])
      expect(r.failed).toEqual([])
    }
  })
  it('--continue-on-error stops on a network-level failure (the default records it as a game error as before)', async () => {
    const net = new TypeError('fetch failed')
    const a = harness({ g2: net })
    const stopped = await runGames(games(4), on, a.deps)
    expect(stopped.stopped).toMatch(/Network failure: fetch failed/)
    expect(a.requested).toEqual(['g1', 'g2'])
    const b = harness({ g2: net })
    const carried = await runGames(games(3), opts, b.deps)
    expect(carried.stopped).toBeNull()
    expect(ids(carried.failed)).toEqual(['g2'])
  })
  it('stops after 5 failed games in a row (configurable), and a success resets the streak', async () => {
    const all = Object.fromEntries(games(8).map((f) => [f.game.id, err500()]))
    const h = harness(all)
    const r = await runGames(games(8), on, h.deps)
    expect(r.stopped).toMatch(/5 games failed in a row/)
    expect(h.requested).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
    expect(ids(r.failed)).toEqual(['g1', 'g2', 'g3', 'g4', 'g5'])
    expect(h.stored).toEqual([])
    const two = harness({ g1: err500(), g2: err500() })
    expect((await runGames(games(5), { continueOnError: true, maxConsecutiveFailures: 2 }, two.deps)).stopped).toMatch(/2 games failed in a row/)
    const spaced = harness({ g1: err500(), g2: err500(), g4: err500(), g5: err500() })
    const ok = await runGames(games(6), { continueOnError: true, maxConsecutiveFailures: 3 }, spaced.deps)
    expect(ok.stopped).toBeNull()
    expect(ids(ok.failed)).toEqual(['g1', 'g2', 'g4', 'g5'])
    expect(spaced.stored).toEqual(['g3', 'g6'])
  })
  it('the consecutive limit does not apply without --continue-on-error', async () => {
    const h = harness({}, Object.fromEntries(games(7).map((f) => [f.game.id, new Error('x')])))
    const r = await runGames(games(7), opts, h.deps)
    expect(r.stopped).toBeNull()
    expect(r.failed).toHaveLength(7)
  })
  it('a re-run requests only the games still not stored (stored current games never reach the loop)', async () => {
    const fixtures = [fx('g1'), fx('g2'), fx('g3')]
    const first = harness({ g2: err500() })
    const planA = planBackfill(fixtures, stored({}), none)
    await runGames(planA.toFetch, on, first.deps)
    const db = stored(Object.fromEntries(first.stored.map((id) => [id, { playhqUpdatedAt: `stamp-${id}`, sourceHash: 'h' }])))
    const planB = planBackfill(fixtures, db, none)
    expect(planB.toFetch.map((f) => f.game.id)).toEqual(['g2'])
    const second = harness()
    expect((await runGames(planB.toFetch, on, second.deps)).failed).toEqual([])
    expect(second.requested).toEqual(['g2'])
  })
  it('the report lists every failed game id with a count, and is empty when nothing failed', async () => {
    expect(failedReport([])).toEqual([])
    const r = await runGames(games(3), on, harness({ g1: err500(), g3: new PlayHQError(503, 'p') }).deps)
    const lines = failedReport(r.failed)
    expect(lines[0]).toMatch(/^\[failed\] 2 games failed and were NOT stored/)
    expect(lines[1]).toContain('g1 Summer 2025/26 / T1 (t1) 2025-11-01 HTTP 500')
    expect(lines[2]).toContain('g3 ')
    expect(lines).toHaveLength(3)
  })
})
