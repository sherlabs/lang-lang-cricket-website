import { describe, expect, it } from 'vitest'
import { mergeBySeason } from '@/lib/stats/aggregate'
import { commonSeasonNames, compareCounts, seasonSplit } from '@/lib/stats/compare'
import { DEFAULT_QUALIFICATION } from '@/lib/stats/qualify'
import { counts, row } from './stats-helpers'

const q = DEFAULT_QUALIFICATION.career
const get = (rows: ReturnType<typeof compareCounts>, key: string) => rows.find((r) => r.key === key)!

describe('compareCounts', () => {
  const a = counts({ games: 40, batInnings: 38, batRuns: 1200, batBalls: 1500, batHighScore: 110, batSixes: 20, bowlBalls: 600, bowlRuns: 400, bowlWickets: 30, bowlBestWickets: 4, bowlBestRuns: 20 })
  const b = counts({ games: 40, batInnings: 30, batRuns: 900, batBalls: 1000, batHighScore: 95, batSixes: 20, bowlBalls: 600, bowlRuns: 500, bowlWickets: 25, bowlBestWickets: 5, bowlBestRuns: 30 })
  const rows = compareCounts(a, b, q)

  it('highlights the higher count and the lower bowling average', () => {
    expect(get(rows, 'runs').better).toBe('a')
    expect(get(rows, 'wickets').better).toBe('a')
    expect(get(rows, 'bowlAvg').better).toBe('a') // 13.33 v 20
    expect(get(rows, 'econ').better).toBe('a')
  })
  it('ties highlight neither', () => {
    expect(get(rows, 'games').better).toBeNull()
    expect(get(rows, 'sixes').better).toBeNull()
  })
  it('best bowling compares wickets then runs', () => {
    expect(get(rows, 'best').better).toBe('b')
  })
  it('does not mark a rate stat unless both players qualify', () => {
    const small = counts({ games: 3, batInnings: 3, batRuns: 150, batBalls: 100 })
    expect(get(compareCounts(a, small, q), 'avg').better).toBeNull()
    expect(get(compareCounts(a, small, q), 'runs').better).toBe('a')
  })
  it('swapping the players swaps the winner', () => {
    expect(get(compareCounts(b, a, q), 'runs').better).toBe('b')
  })
  it('a player with no data on either side is not marked', () => {
    expect(get(compareCounts(counts(), counts(), q), 'runs').better).toBeNull()
  })
})

describe('season helpers', () => {
  const A = mergeBySeason([row({ playerId: 1, seasonName: 'Summer 2025/26', seasonOrder: 1, counts: { batRuns: 10 } }), row({ playerId: 1, seasonName: 'Summer 2023/24', seasonOrder: 3, counts: { batRuns: 5 } })])
  const B = mergeBySeason([row({ playerId: 2, seasonName: 'Summer 2025/26', seasonOrder: 1, counts: { batRuns: 7 } }), row({ playerId: 2, seasonName: 'Summer 2024/25', seasonOrder: 2, counts: { batRuns: 8 } })])
  it('finds common seasons', () => expect(commonSeasonNames(A, B)).toEqual(['Summer 2025/26']))
  it('builds a shared axis oldest first with nulls for missing seasons', () => {
    const s = seasonSplit(A, B)
    expect(s.map((r) => r.label)).toEqual(['2023/24', '2024/25', '2025/26'])
    expect(s[0].b).toBeNull()
    expect(s[1].a).toBeNull()
    expect(seasonSplit(A, B, ['Summer 2025/26'])).toHaveLength(1)
  })
})
