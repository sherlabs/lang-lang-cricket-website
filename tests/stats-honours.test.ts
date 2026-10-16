import { describe, expect, it } from 'vitest'
import { DEFAULT_HONOUR_CATEGORIES } from '@/lib/site-settings-core'
import { buildHonourBoard, categoriseHonour, honourKey, NO_YEAR_LABEL, startYear, type HonourPlayer } from '@/lib/stats/honours'

describe('startYear', () => {
  it.each([
    ['2024', 2024], ['2023/24', 2023], ['2023-24', 2023], ['2010–2012', 2010], ['2023/24 - 2024/25', 2023], ['1999', 1999],
    ['unknown', null], ['', null], ['12345', null], ['Year 7', null],
  ])('%s -> %s', (years, expected) => expect(startYear(years)).toBe(expected))
})

describe('honourKey / categoriseHonour', () => {
  it('normalises case and whitespace', () => {
    expect(honourKey('  Best  and Fairest ')).toBe(honourKey('best and fairest'))
  })
  it('categorises by keyword, in rule order, else Other', () => {
    const c = (t: string) => categoriseHonour(t, DEFAULT_HONOUR_CATEGORIES)
    expect(c('Life Member')).toBe('Life Member')
    expect(c('Best and Fairest')).toBe('Best and Fairest / Club Champion')
    expect(c('A Grade Premiership Player')).toBe('Premiership')
    expect(c('Club President')).toBe('Leadership / Role')
    expect(c('CCCA Representative')).toBe('Association honours')
    expect(c('Most Improved')).toBe('Other')
  })
})

const P = (id: number, name: string, honours: [string, string][]): HonourPlayer => ({
  id, name, slug: name.toLowerCase().replace(/\s+/g, '-'), honours: honours.map(([years, title]) => ({ years, title })),
})

describe('buildHonourBoard', () => {
  const players = [
    P(1, 'Ann A', [['2024/25', 'Club Champion'], ['', 'Life Member']]),
    P(2, 'Bob B', [['2023-24', ' club  champion '], ['unknown', 'Life Member']]),
    P(3, 'Cat C', [['2010–2012', 'Club President'], ['2025', 'Most Improved'], ['2025', '   ']]),
  ]
  const board = buildHonourBoard(players, DEFAULT_HONOUR_CATEGORIES)

  it('groups case- and whitespace-insensitively and drops empty titles', () => {
    const champ = board.byHonour.find((g) => g.key === 'club champion')!
    expect(champ.recipients.map((r) => r.name)).toEqual(['Ann A', 'Bob B'])
    expect(board.total).toBe(6)
  })
  it('sorts recipients newest year first, unparsable last', () => {
    const life = board.byHonour.find((g) => g.key === 'life member')!
    expect(life.recipients.map((r) => r.name)).toEqual(['Ann A', 'Bob B'])
    expect(life.recipients[0].sortYear).toBeNull()
  })
  it('orders groups by category order', () => {
    expect(board.byHonour.map((g) => g.category)).toEqual(['Life Member', 'Best and Fairest / Club Champion', 'Leadership / Role', 'Other'])
  })
  it('by year: newest first with "year not recorded" last', () => {
    expect(board.byYear.map((y) => y.label)).toEqual(['2025', '2024', '2023', '2010', NO_YEAR_LABEL])
  })
  it('lists only categories present', () => {
    expect(board.categories).toEqual(['Life Member', 'Best and Fairest / Club Champion', 'Leadership / Role', 'Other'])
  })
  it('empty input', () => {
    expect(buildHonourBoard([], DEFAULT_HONOUR_CATEGORIES)).toMatchObject({ byHonour: [], byYear: [], total: 0 })
  })
})
