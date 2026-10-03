import { describe, expect, it } from 'vitest'
import { cardRole, cardStats, isDrawableImageType, parseCardSeason, parseFormat, CARD_SIZES } from '@/lib/stats/card'
import { counts } from './stats-helpers'

describe('cardRole', () => {
  it('batter, bowler and all-rounder by runs v 20 x wickets', () => {
    expect(cardRole(counts({ batRuns: 2000, bowlWickets: 5 }))).toBe('batter')
    expect(cardRole(counts({ batRuns: 100, bowlWickets: 60 }))).toBe('bowler')
    expect(cardRole(counts({ batRuns: 600, bowlWickets: 30 }))).toBe('allrounder')
    expect(cardRole(counts())).toBe('batter')
  })
})

describe('cardStats', () => {
  it('gives four stats per role, with dashes for undefined values', () => {
    const c = counts({ games: 10, batRuns: 300, batInnings: 10, batNotOuts: 0, batBalls: 400, batHighScore: 88, batHighScoreNotOut: true })
    const s = cardStats(c, 'batter')
    expect(s.map((x) => x.label)).toEqual(['Runs', 'Average', 'High score', 'Games'])
    expect(s[1].value).toBe('30.00')
    expect(s[2].value).toBe('88*')
    expect(cardStats(counts(), 'bowler').map((x) => x.value)).toEqual(['0', '–', '–', '0'])
    expect(cardStats(c, 'allrounder')).toHaveLength(4)
  })
})

describe('parameter whitelists', () => {
  it('unknown format falls back to og', () => {
    expect(parseFormat('square')).toBe('square')
    expect(parseFormat('huge')).toBe('og')
    expect(parseFormat(null)).toBe('og')
  })
  it('unknown season is ignored', () => {
    expect(parseCardSeason('Summer 2025/26', ['Summer 2025/26'])).toBe('Summer 2025/26')
    expect(parseCardSeason('Summer 1999/00', ['Summer 2025/26'])).toBeNull()
    expect(parseCardSeason(undefined, [])).toBeNull()
  })
  it('sizes differ per format', () => {
    expect(CARD_SIZES.og).not.toEqual(CARD_SIZES.square)
  })
  it('only png and jpeg logos are drawn', () => {
    expect(isDrawableImageType('image/png')).toBe(true)
    expect(isDrawableImageType('image/jpeg; charset=x')).toBe(true)
    expect(isDrawableImageType('image/webp')).toBe(false)
    expect(isDrawableImageType('image/svg+xml')).toBe(false)
    expect(isDrawableImageType(null)).toBe(false)
  })
})
