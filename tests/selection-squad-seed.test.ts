import { describe, expect, it } from 'vitest'
import { currentSeasonStartYear } from '../lib/selection/season'
import { lastSeasonYear, matchesRecency, playedYears, recencyOf, seedFromLastSeason, gradeKeyOf } from '../lib/selection/squad-seed'

const rows = [
  { playerId: 1, gradeName: '2. B Grade', games: 10, seasonName: '2025/26' },
  { playerId: 1, gradeName: 'B Grade', games: 5, seasonName: '2024/25' },
  { playerId: 2, gradeName: 'b grade', games: 3, seasonName: '2025/26' },
  { playerId: 3, gradeName: 'A Grade', games: 0, seasonName: '2025/26' },
  { playerId: 4, gradeName: 'A Grade', games: 8, seasonName: '2022/23' },
  { playerId: 5, gradeName: 'A Grade', games: 2, seasonStartYear: 2025, seasonName: 'Imported' },
]

describe('currentSeasonStartYear', () => {
  it('starts a season in the configured month, club time', () => {
    expect(currentSeasonStartYear(new Date('2026-10-05T00:00:00Z'), 'Australia/Melbourne', 7)).toBe(2026)
    expect(currentSeasonStartYear(new Date('2027-02-01T00:00:00Z'), 'Australia/Melbourne', 7)).toBe(2026)
    expect(currentSeasonStartYear(new Date('2026-06-30T20:00:00Z'), 'Australia/Melbourne', 7)).toBe(2026) // 1 July local
  })
})

describe('recency', () => {
  const years = playedYears(rows)
  it('reads the years a player played (games above zero only)', () => {
    expect([...years.get(1)!].sort()).toEqual([2024, 2025])
    expect(years.has(3)).toBe(false)
    expect(years.get(5)!.has(2025)).toBe(true)
  })
  it('tags and filters', () => {
    expect(recencyOf(years.get(1), 2025)).toBe('this-season')
    expect(recencyOf(years.get(1), 2026)).toBe('last-season')
    expect(recencyOf(years.get(4), 2025)).toBe('recent')
    expect(recencyOf(years.get(4), 2030)).toBe('never')
    expect(recencyOf(undefined, 2026)).toBe('never')
    expect(matchesRecency('last-season', 'recent')).toBe(true)
    expect(matchesRecency('never', 'recent')).toBe(false)
    expect(matchesRecency('never', 'never')).toBe(true)
    expect(matchesRecency('this-season', 'last-season')).toBe(false)
    expect(matchesRecency('never', 'all')).toBe(true)
  })
})

describe('auto-seed from last season', () => {
  it('finds the newest earlier season with games', () => {
    expect(lastSeasonYear(rows, 2026)).toBe(2025)
    expect(lastSeasonYear(rows, 2025)).toBe(2024)
    expect(lastSeasonYear(rows, 2022)).toBeNull()
  })
  it('groups by normalised grade name, skipping zero-game rows', () => {
    const seed = seedFromLastSeason(rows, 2025)
    expect(seed).toEqual([
      { gradeKey: 'a grade', playerIds: [5] },
      { gradeKey: 'b grade', playerIds: [1, 2] },
    ])
  })
  it('honours a rename so a renamed grade still matches', () => {
    const canonical = (g: string) => (g === 'A Grade' ? 'Premier Grade' : g)
    const seed = seedFromLastSeason(rows, 2025, canonical)
    expect(seed.map((s) => s.gradeKey)).toEqual(['b grade', 'premier grade'])
    expect(gradeKeyOf('A Grade', canonical)).toBe('premier grade')
    expect(gradeKeyOf(null)).toBe('')
  })
})
