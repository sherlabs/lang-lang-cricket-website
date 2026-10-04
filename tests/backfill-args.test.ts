import { describe, expect, it } from 'vitest'
import { DEFAULT_DELAY_MS, estimateSeconds, parseBackfillArgs, planBackfill, selectSeasons, type FixtureGame, type StoredStamp } from '@/lib/match-store/backfill'

describe('parseBackfillArgs', () => {
  it('defaults to a dry run with the safe delay', () => {
    expect(parseBackfillArgs(['--target', '127.0.0.1/langlang_dev'])).toEqual({
      apply: false, seasons: [], since: null, limit: null, teamId: null, delayMs: DEFAULT_DELAY_MS, logPath: null, force: false,
    })
  })
  it('reads every option, including repeated seasons and = forms; the guard flags are ignored here', () => {
    const a = parseBackfillArgs(['--', '--target', 'h/db', '--apply', '--confirm', '--season', '2025/26', '--season=2024/25', '--since', '2025-10-01', '--limit', '3', '--team=t1', '--delay-ms', '2000', '--log', 'x.log', '--force'])
    expect(a).toEqual({ apply: true, seasons: ['2025/26', '2024/25'], since: '2025-10-01', limit: 3, teamId: 't1', delayMs: 2000, logPath: 'x.log', force: true })
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
      { seasonName: 'Summer 2025/26', teamId: 't1', teamName: 'T1', fetch: 0, skip: 1 },
      { seasonName: 'Summer 2025/26', teamId: 't2', teamName: 'T2', fetch: 1, skip: 0 },
      { seasonName: 'Summer 2024/25', teamId: 't1', teamName: 'T1', fetch: 1, skip: 0 },
    ])
    expect(planBackfill([fx('a'), fx('c', {}, 't2')], stored({}), { ...none, teamId: 't2' }).toFetch.map((f) => f.game.id)).toEqual(['c'])
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
