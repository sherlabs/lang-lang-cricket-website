import { describe, expect, it } from 'vitest'
import { ALLROUNDER_FORMULA, allRounderScore, honourMentionsSeason, honoursForSeason, messageParagraphs, resultsByGrade, seasonParts, summariseResults, topAllRounders } from '@/lib/stats/yearbook'
import type { Game } from '@/lib/playhq/types'
import { counts } from './stats-helpers'

describe('topAllRounders', () => {
  const items = [
    { id: 1, counts: counts({ batRuns: 300, bowlWickets: 20 }) },
    { id: 2, counts: counts({ batRuns: 99, bowlWickets: 40 }) },
    { id: 3, counts: counts({ batRuns: 400, bowlWickets: 7 }) },
    { id: 4, counts: counts({ batRuns: 200, bowlWickets: 20 }) },
    { id: 5, counts: counts({ batRuns: 300, bowlWickets: 20 }) },
  ]
  it('applies the minimums, ranks by runs + 20 x wickets, and shares rank on ties', () => {
    const r = topAllRounders(items)
    expect(r.map((x) => [x.item.id, x.rank, x.value])).toEqual([[1, 1, 700], [5, 1, 700], [4, 3, 600]])
    expect(allRounderScore(items[0].counts)).toBe(700)
  })
  it('prints its formula', () => {
    expect(ALLROUNDER_FORMULA).toBe('runs + 20 x wickets (at least 100 runs and 8 wickets)')
  })
})

describe('honourMentionsSeason', () => {
  const S = 'Summer 2025/26'
  it.each([
    ['2025/26', true], ['2025-26', true], ['2025–26', true], ['2025', true], ['2023/24 - 2025/26', true], ['2025/2026', false],
    ['2024/25', false], ['2024', false], ['2026', true], ['2023-2026', true], ['2010–2012', false], ['2025-2027', true], ['2022-2024', false], ['unknown', false], ['', false], ['2024/25 - 2025/26', true], ['2025 to 2027', true],
  ])('%s -> %s', (years, expected) => {
    expect(honourMentionsSeason(years, S)).toBe(expected)
  })
  it('does not match 2025 inside another year range ending in 25', () => {
    expect(honourMentionsSeason('2024/25', S)).toBe(false)
    expect(honourMentionsSeason('2012/25', S)).toBe(false)
  })
  it('honoursForSeason returns matching rows sorted by title then name', () => {
    const players = [
      { id: 1, name: 'Zed', slug: 'zed', honours: [{ years: '2025/26', title: ' Best  and Fairest ' }, { years: '2024', title: 'Captain' }] },
      { id: 2, name: 'Amy', slug: 'amy', honours: [{ years: '2025', title: 'Best and Fairest' }] },
    ]
    expect(honoursForSeason(players, S).map((h) => [h.name, h.title])).toEqual([['Amy', 'Best and Fairest'], ['Zed', 'Best and Fairest']])
  })
  it('a range of bare years covers the seasons that start inside it', () => {
    expect(honourMentionsSeason('2010-2012', 'Summer 2011/12')).toBe(true)
    expect(honourMentionsSeason('2023-2026', 'Summer 2025/26')).toBe(true)
    expect(honourMentionsSeason('2010-2012', 'Summer 2013/14')).toBe(false)
  })
  it('a season name with no year matches nothing', () => {
    expect(seasonParts('Summer')).toBeNull()
    expect(honourMentionsSeason('2025', 'Summer')).toBe(false)
  })
})

const game = (o: Partial<Game> & { outcome?: string | null }): Game =>
  ({ id: 'x', status: 'FINAL', gradeName: 'A Grade', sortKey: '2025-10-01T00:00:00', club: { id: 'c', name: 'LL', isHome: true, outcome: o.outcome ?? null, score: 1 }, opponent: { id: 'o', name: 'Opp', isHome: false, outcome: null, score: 2 }, ...o }) as unknown as Game

describe('results', () => {
  const games = [
    game({ id: '1', outcome: 'WON_ON_FIRST_INNINGS' }),
    game({ id: '2', outcome: 'LOST' }),
    game({ id: '3', outcome: 'DRAW' }),
    game({ id: '4', status: 'ABANDONED', outcome: 'ABANDONED' }),
    game({ id: '5', status: 'UPCOMING' }),
    game({ id: '6', outcome: 'WON', gradeName: 'B Grade' }),
  ]
  it('summarises finished games only', () => {
    expect(summariseResults(games)).toEqual({ played: 4, won: 2, lost: 1, other: 1, winRate: 50 })
    expect(summariseResults([])).toEqual({ played: 0, won: 0, lost: 0, other: 0, winRate: null })
  })
  it('groups by grade, skipping unfinished games', () => {
    expect(resultsByGrade(games).map((g) => [g.grade, g.games.length])).toEqual([['A Grade', 4], ['B Grade', 1]])
  })
})

describe('messageParagraphs', () => {
  it('splits on blank lines and drops empties', () => {
    expect(messageParagraphs('One.\n\n  Two\nlines.\n\n\n')).toEqual(['One.', 'Two\nlines.'])
    expect(messageParagraphs('   ')).toEqual([])
  })
})
