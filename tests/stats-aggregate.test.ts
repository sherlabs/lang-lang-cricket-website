import { describe, expect, it } from 'vitest'
import { careerOf, mergeBySeason } from '@/lib/stats/aggregate'
import { currentSeasonName, currentSeasonOrder, coverage, coverageLine, seasonIndex, sinceLabel } from '@/lib/stats/season-window'
import { row } from './stats-helpers'

describe('mergeBySeason', () => {
  it('merges two teams in one season with best-of high score and best figures', () => {
    const merged = mergeBySeason([
      row({ teamId: 'a', gradeName: 'A Grade', counts: { games: 5, batRuns: 100, batInnings: 5, batHighScore: 60, bowlBalls: 60, bowlBestWickets: 2, bowlBestRuns: 10 } }),
      row({ teamId: 'b', gradeName: 'B Grade', counts: { games: 4, batRuns: 80, batInnings: 4, batHighScore: 60, batHighScoreNotOut: true, bowlBalls: 60, bowlBestWickets: 3, bowlBestRuns: 12 } }),
    ])
    expect(merged).toHaveLength(1)
    const c = merged[0].counts
    expect(c.games).toBe(9)
    expect(c.batRuns).toBe(180)
    expect(c.batHighScore).toBe(60)
    expect(c.batHighScoreNotOut).toBe(true) // not-out tie-break
    expect(c.bowlBestWickets).toBe(3)
    expect(merged[0].gradeNames).toEqual(['A Grade', 'B Grade'])
  })

  it('keeps different seasons and players apart', () => {
    expect(mergeBySeason([row(), row({ seasonName: 'Summer 2024/25', seasonOrder: 1 }), row({ playerId: 2 })])).toHaveLength(3)
  })
})

describe('careerOf', () => {
  it('sums seasons, never sums high scores, counts seasons with games', () => {
    const [c] = careerOf([
      row({ counts: { games: 10, batRuns: 300, batHighScore: 101 } }),
      row({ seasonName: 'Summer 2024/25', seasonOrder: 1, counts: { games: 8, batRuns: 200, batHighScore: 70 } }),
      row({ seasonName: 'Summer 2023/24', seasonOrder: 2, counts: { games: 0 } }),
    ])
    expect(c.counts.batRuns).toBe(500)
    expect(c.counts.batHighScore).toBe(101)
    expect(c.seasons).toBe(2)
  })
})

describe('season window', () => {
  const rows = [
    { seasonName: 'Summer 2024/25', seasonOrder: 1 },
    { seasonName: 'Summer 2023/24', seasonOrder: 2 },
    { seasonName: 'Summer 2025/26', seasonOrder: 0 },
  ]
  it('is data-defined, and not a literal 0', () => {
    const noNewest = rows.filter((r) => r.seasonOrder > 0)
    expect(currentSeasonOrder(noNewest)).toBe(1)
    expect(currentSeasonName(noNewest)).toBe('Summer 2024/25')
    expect(currentSeasonOrder([])).toBeNull()
  })
  it('computes coverage from the data', () => {
    expect(coverage(rows)).toEqual({ from: 'Summer 2023/24', to: 'Summer 2025/26' })
    expect(sinceLabel(rows)).toBe('since 2023/24')
    expect(coverageLine(rows)).toBe('Records cover seasons from 2023/24; earlier history is not in the database.')
    expect(sinceLabel([])).toBe('in the stored data')
    expect(seasonIndex(rows).map((s) => s.seasonName)[0]).toBe('Summer 2025/26')
  })
})
