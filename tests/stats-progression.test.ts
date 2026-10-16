import { describe, expect, it } from 'vitest'
import { mergeBySeason } from '@/lib/stats/aggregate'
import { DEFAULT_QUALIFICATION } from '@/lib/stats/qualify'
import { bestWorstSeasons, hasBatting, hasBowling, progressionSeries } from '@/lib/stats/progression'
import { row } from './stats-helpers'

const S = (name: string, order: number, counts: Parameters<typeof row>[0] extends infer T ? (T extends { counts?: infer C } ? C : never) : never, extra: { teamId?: string } = {}) =>
  row({ seasonName: name, seasonOrder: order, ...extra, counts })

const rows = [
  S('Summer 2025/26', 1, { games: 16, batInnings: 15, batRuns: 700, batBalls: 800, bowlBalls: 120, bowlWickets: 10, bowlRuns: 90 }),
  S('Summer 2024/25', 2, { games: 15, batInnings: 14, batRuns: 350, batBalls: 500, bowlBalls: 120, bowlWickets: 20, bowlRuns: 100 }),
  S('Summer 2023/24', 3, { games: 5, batInnings: 4, batRuns: 40, batBalls: 60 }),
]
const seasons = mergeBySeason(rows)

describe('progressionSeries', () => {
  it('orders seasons oldest first and labels them short', () => {
    const runs = progressionSeries(seasons).find((s) => s.key === 'runs')!
    expect(runs.points.map((p) => p.label)).toEqual(['2023/24', '2024/25', '2025/26'])
    expect(runs.points.map((p) => p.value)).toEqual([40, 350, 700])
  })
  it('draws no wickets series when only one season has bowling', () => {
    const one = mergeBySeason([rows[0], rows[2]])
    expect(progressionSeries(one).some((s) => s.key === 'wickets')).toBe(false)
  })
  it('draws nothing for a single season', () => {
    expect(progressionSeries(mergeBySeason([rows[0]]))).toEqual([])
  })
  it('merges a two-team season into one point', () => {
    const two = mergeBySeason([...rows, S('Summer 2025/26', 1, { games: 2, batInnings: 2, batRuns: 50 }, { teamId: 'b' })])
    const runs = progressionSeries(two).find((s) => s.key === 'runs')!
    expect(runs.points.at(-1)!.value).toBe(750)
  })
  it('detects batting and bowling presence', () => {
    expect(hasBatting(seasons)).toBe(true)
    expect(hasBowling(seasons)).toBe(true)
    expect(hasBowling(mergeBySeason([rows[2]]))).toBe(false)
  })
})

describe('bestWorstSeasons', () => {
  it('finds best and worst runs across seasons', () => {
    const bw = bestWorstSeasons(seasons, DEFAULT_QUALIFICATION.season)
    expect(bw.runs.best).toEqual(['Summer 2025/26'])
    expect(bw.runs.worst).toEqual(['Summer 2023/24'])
    expect(bw.runs.bestText).toBe('700')
  })
  it('ignores seasons below the qualifying minimum for rate stats', () => {
    // 2023/24 has 40 runs / 4 innings: not eligible for an average, so only two seasons compete
    const bw = bestWorstSeasons(seasons, DEFAULT_QUALIFICATION.season)
    expect(bw.avg.worst).not.toContain('Summer 2023/24')
  })
  it('lower economy is better', () => {
    const bw = bestWorstSeasons(seasons, { ...DEFAULT_QUALIFICATION.season, econBalls: 60 })
    expect(bw.econ.best).toEqual(['Summer 2025/26']) // 4.50 v 5.00
  })
  it('returns nothing with fewer than two eligible seasons or when all values tie', () => {
    expect(bestWorstSeasons(mergeBySeason([rows[0]]), DEFAULT_QUALIFICATION.season)).toEqual({})
    const tie = mergeBySeason([S('Summer 2025/26', 1, { games: 10, batInnings: 10, batRuns: 200 }), S('Summer 2024/25', 2, { games: 10, batInnings: 10, batRuns: 200 })])
    expect(bestWorstSeasons(tie, DEFAULT_QUALIFICATION.season).runs).toBeUndefined()
  })
  it('returns every tied best season', () => {
    const t = mergeBySeason([
      S('Summer 2025/26', 1, { games: 10, batInnings: 10, batRuns: 300 }),
      S('Summer 2024/25', 2, { games: 10, batInnings: 10, batRuns: 300 }),
      S('Summer 2023/24', 3, { games: 10, batInnings: 10, batRuns: 100 }),
    ])
    expect(bestWorstSeasons(t, DEFAULT_QUALIFICATION.season).runs.best.sort()).toEqual(['Summer 2024/25', 'Summer 2025/26'])
  })
})
