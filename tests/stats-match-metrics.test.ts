import { describe, expect, it } from 'vitest'
import { emptyMatchCounts } from '@/lib/stats/match/counts'
import { MATCH_LEADERBOARD_KEYS, MATCH_METRICS, getMatchMetric, matchLeaderboardMetrics, matchQualifierText, rankMatchBy } from '@/lib/stats/match/metrics'
import { MATCH_MILESTONE_THRESHOLDS, matchMilestonesCrossed, matchMilestonesFor } from '@/lib/stats/match/milestones'
import { DEFAULT_MATCH_MINIMUMS, resolveMatchMinimums } from '@/lib/stats/match/minimums'
import { DEFAULT_STATS_SETTINGS, resolveStatsSettings } from '@/lib/site-settings-core'
import type { MatchCounts } from '@/lib/stats/match/types'

const c = (o: Partial<MatchCounts> = {}): MatchCounts => ({ ...emptyMatchCounts(), ...o })
const min = DEFAULT_MATCH_MINIMUMS

describe('match metric registry', () => {
  it('has unique keys and every leaderboard key exists', () => {
    expect(new Set(MATCH_METRICS.map((m) => m.key)).size).toBe(MATCH_METRICS.length)
    for (const k of MATCH_LEADERBOARD_KEYS) expect(getMatchMetric(k)).toBeDefined()
    expect(matchLeaderboardMetrics('batting').map((m) => m.key)).toEqual(['fifties', 'hundreds', 'goldenDucks', 'ducks'])
  })
  it('values are null (a dash), never zero, when the denominator rows are missing', () => {
    expect(getMatchMetric('runOuts')!.value(c())).toBeNull()
    expect(getMatchMetric('runOuts')!.value(c({ fieldingInnings: 2, runOuts: 0 }))).toBe(0)
    expect(getMatchMetric('goldenDucks')!.value(c({ ducks: 2, ducksWithBalls: 0 }))).toBeNull()
    expect(getMatchMetric('goldenDucks')!.value(c({ ducks: 2, ducksWithBalls: 1, goldenDucks: 1 }))).toBe(1)
    expect(getMatchMetric('bowledPct')!.value(c())).toBeNull()
    expect(getMatchMetric('ballsPerBoundary')!.value(c({ boundaryBalls: 120 }))).toBeNull()
    expect(getMatchMetric('avgPosition')!.value(c())).toBeNull()
    expect(getMatchMetric('fifties')!.format(c({ fifties: 3 }))).toBe('3')
    expect(getMatchMetric('winPct')!.format(c({ wins: 3, resultGames: 4 }))).toBe('75.0')
  })
  it('fifty conversion is hundreds over scores of 50 or more', () => {
    expect(getMatchMetric('fiftyConversion')!.value(c({ fifties: 3, hundreds: 1 }))).toBe(25)
  })
})

describe('rankMatchBy', () => {
  const items = [{ playerId: 1, counts: c({ fifties: 3 }) }, { playerId: 2, counts: c({ fifties: 5 }) }, { playerId: 3, counts: c({ fifties: 3 }) }, { playerId: 4, counts: c({ fifties: 0 }) }]
  it('ranks counts with ties sharing a rank and lists nobody on zero', () => {
    const r = rankMatchBy(items, getMatchMetric('fifties')!, min)
    expect(r.ranked.map((x) => [x.item.playerId, x.rank])).toEqual([[2, 1], [1, 2], [3, 2]])
    expect(r.unqualified).toEqual([])
  })
  it('a rate needs its sample size, else it is listed but never ranked', () => {
    const win = getMatchMetric('winPct')!
    const r = rankMatchBy([{ playerId: 1, counts: c({ wins: 9, resultGames: 10 }) }, { playerId: 2, counts: c({ wins: 3, resultGames: 3 }) }], win, min)
    expect(r.ranked.map((x) => x.item.playerId)).toEqual([1])
    expect(r.unqualified.map((x) => x.playerId)).toEqual([2])
    expect(matchQualifierText('winGames', min)).toMatch(/10 games/)
  })
  it('lower is better for share metrics', () => {
    const m = getMatchMetric('bowledPct')!
    const r = rankMatchBy([{ playerId: 1, counts: c({ outs: 20, dismissals: { ...emptyMatchCounts().dismissals, bowled: 10 } }) }, { playerId: 2, counts: c({ outs: 20, dismissals: { ...emptyMatchCounts().dismissals, bowled: 2 } }) }], m, min)
    expect(r.ranked.map((x) => x.item.playerId)).toEqual([2, 1])
  })
})

describe('match milestones (since the first stored match, never merged into baseline milestones)', () => {
  it('names the real count once the first threshold is reached', () => {
    expect(matchMilestonesFor(c({ fifties: 7, hundreds: 1, fiveFors: 0 })).map((m) => m.label)).toEqual(['7 fifties', '1 hundred'])
    expect(MATCH_MILESTONE_THRESHOLDS).toEqual({ fifties: [1, 5, 10, 25], hundreds: [1, 2, 5], fiveFors: [1, 3, 5] })
  })
  it('finds milestones crossed between two snapshots', () => {
    const now = new Map([[1, c({ fifties: 5 })], [2, c({ fifties: 5 })], [3, c({ hundreds: 1 })]])
    const before = new Map([[1, c({ fifties: 4 })], [2, c({ fifties: 5 })]])
    expect(matchMilestonesCrossed(now, before).map((x) => [x.playerId, x.label])).toEqual([[1, '5 fifties'], [3, '1 hundred']])
  })
})

describe('match minimums settings', () => {
  it('defaults when nothing is saved and coerces bad values', () => {
    expect(DEFAULT_STATS_SETTINGS.matchMinimums).toEqual({ oppositionInnings: 3, oppositionBalls: 72, positionInnings: 5, rateInnings: 10, winGames: 10, ballsForBoundary: 100, partnershipPairGames: 2 })
    expect(resolveMatchMinimums({ winGames: 4.7, rateInnings: -1, oppositionBalls: 'x', positionInnings: null })).toMatchObject({ winGames: 4, rateInnings: 10, oppositionBalls: 72, positionInnings: 5 })
    expect(resolveStatsSettings({ matchMinimums: { winGames: 20 } }).matchMinimums.winGames).toBe(20)
    expect(resolveStatsSettings(null).matchMinimums).toEqual(DEFAULT_MATCH_MINIMUMS)
  })
})

describe('small-sample note for run outs and stumpings (rule 0.7)', () => {
  it('flags a board built on fewer than five recorded events, and only those boards', async () => {
    const { smallEventSample, buildMatchBoard } = await import('@/lib/stats/match/board')
    expect(smallEventSample({ key: 'runOuts' }, [c({ runOuts: 2 }), c({ stumpings: 1 })])).toBe(true)
    expect(smallEventSample({ key: 'runOuts' }, [c({ runOuts: 5 })])).toBe(false)
    expect(smallEventSample({ key: 'runOuts' }, [c()])).toBe(false)
    expect(smallEventSample({ key: 'fifties' }, [c({ runOuts: 1 })])).toBe(false)
    expect(typeof buildMatchBoard).toBe('function')
  })
})
