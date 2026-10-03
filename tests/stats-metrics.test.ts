import { describe, expect, it } from 'vitest'
import { METRICS, getMetric, leaderboardMetrics } from '@/lib/stats/metrics'
import { DEFAULT_QUALIFICATION, qualifierText, qualifies } from '@/lib/stats/qualify'
import { badgeFor, ordinal, rankBy, rankValues } from '@/lib/stats/rank'
import { counts } from './stats-helpers'

describe('metrics', () => {
  it('registry keys are unique', () => {
    expect(new Set(METRICS.map((m) => m.key)).size).toBe(METRICS.length)
  })
  it('average is null with no dismissals; strike rate null with zero balls', () => {
    const c = counts({ batInnings: 3, batNotOuts: 3, batRuns: 90, batBalls: 0 })
    expect(getMetric('avg')!.value(c)).toBeNull()
    expect(getMetric('sr')!.value(c)).toBeNull()
    expect(getMetric('sr')!.format(c)).toBe('–')
  })
  it('high score shows the star and breaks ties for not-out', () => {
    const a = counts({ batInnings: 1, batHighScore: 100, batHighScoreNotOut: true })
    const b = counts({ batInnings: 1, batHighScore: 100 })
    const hs = getMetric('hs')!
    expect(hs.format(a)).toBe('100*')
    expect(hs.value(a)!).toBeGreaterThan(hs.value(b)!)
    expect(hs.value(counts())).toBeNull()
  })
  it('best bowling orders by wickets then fewer runs', () => {
    const best = getMetric('best')!
    const x = counts({ bowlBalls: 24, bowlBestWickets: 5, bowlBestRuns: 20 })
    const y = counts({ bowlBalls: 24, bowlBestWickets: 5, bowlBestRuns: 12 })
    const z = counts({ bowlBalls: 24, bowlBestWickets: 6, bowlBestRuns: 60 })
    expect(best.value(y)!).toBeGreaterThan(best.value(x)!)
    expect(best.value(z)!).toBeGreaterThan(best.value(y)!)
    expect(best.format(y)).toBe('5/12')
    expect(best.value(counts())).toBeNull()
  })
  it('economy and derived per-game metrics', () => {
    expect(getMetric('econ')!.value(counts({ bowlBalls: 60, bowlRuns: 40 }))).toBe(4)
    expect(getMetric('runsPerGame')!.value(counts({ games: 0, batRuns: 10 }))).toBeNull()
    expect(getMetric('boundaryPct')!.value(counts({ batRuns: 100, batFours: 5, batSixes: 5 }))).toBe(50)
  })
  it('leaderboard tabs have metrics', () => {
    for (const g of ['batting', 'bowling', 'fielding', 'games'] as const) expect(leaderboardMetrics(g).length).toBeGreaterThan(0)
  })
})

describe('qualify', () => {
  const s = DEFAULT_QUALIFICATION
  it('applies the career and season minimums', () => {
    expect(qualifies('batAvg', counts({ batRuns: 300, batInnings: 8 }), s.career)).toBe(true)
    expect(qualifies('batAvg', counts({ batRuns: 299, batInnings: 8 }), s.career)).toBe(false)
    expect(qualifies('batAvg', counts({ batRuns: 100, batInnings: 5 }), s.season)).toBe(true)
    expect(qualifies('econ', counts({ bowlBalls: 119 }), s.season)).toBe(false)
    expect(qualifies('bowlAvg', counts({ bowlWickets: 25 }), s.career)).toBe(true)
  })
  it('writes caption text', () => {
    expect(qualifierText('batAvg', s.career)).toBe('Batting average needs 300 runs and 8 innings.')
    expect(qualifierText('econ', s.career)).toContain('50 overs')
    expect(qualifierText('count', s.career)).toBeNull()
  })
})

describe('rank', () => {
  it('uses competition ranking so ties share a rank', () => {
    const r = rankValues([{ v: 10 }, { v: 9 }, { v: 9 }, { v: 5 }, { v: null }], (x) => x.v, true)
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4])
  })
  it('ranks ascending for lower-is-better metrics', () => {
    expect(rankValues([{ v: 5 }, { v: 3 }], (x) => x.v, false)[0].item.v).toBe(3)
  })
  it('rankBy separates unqualified rows and skips zero counting values', () => {
    const items = [
      { id: 1, counts: counts({ batRuns: 400, batInnings: 10, batNotOuts: 0 }) },
      { id: 2, counts: counts({ batRuns: 150, batInnings: 3, batNotOuts: 0 }) },
      { id: 3, counts: counts({ batRuns: 0 }) },
    ]
    const avg = rankBy(items, getMetric('avg')!, DEFAULT_QUALIFICATION.career)
    expect(avg.ranked.map((r) => r.item.id)).toEqual([1])
    expect(avg.unqualified.map((u) => u.id)).toEqual([2])
    const runs = rankBy(items, getMetric('runs')!, DEFAULT_QUALIFICATION.career)
    expect(runs.ranked.map((r) => r.item.id)).toEqual([1, 2])
    expect(rankBy(items, getMetric('runs')!, DEFAULT_QUALIFICATION.career, { limit: 1 }).ranked).toHaveLength(1)
  })
  it('badges and ordinals', () => {
    expect([1, 2, 3, 4].map(badgeFor)).toEqual(['gold', 'silver', 'bronze', null])
    expect([1, 2, 3, 4, 11, 12, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '21st', '22nd'])
  })
})
