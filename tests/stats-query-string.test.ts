import { describe, expect, it } from 'vitest'
import { csvCell, toCsv } from '@/lib/stats/csv'
import { effectiveCategories, parseStatsParams, statsHref } from '@/lib/stats/query-string'

const known = { seasons: ['Summer 2025/26', 'Summer 2024/25'], grades: ['A Grade', 'B Grade'] }

describe('parseStatsParams', () => {
  it('defaults on empty input', () => {
    expect(parseStatsParams({}, known)).toMatchObject({ season: 'all', grade: 'all', cats: null, juniors: false, metric: 'runs', group: 'batting' })
  })
  it('accepts known values', () => {
    expect(parseStatsParams({ season: 'Summer 2025/26', grade: 'B Grade', metric: 'wickets', cat: 'senior,womens', juniors: '1' }, known)).toMatchObject({
      season: 'Summer 2025/26', grade: 'B Grade', metric: 'wickets', group: 'bowling', cats: ['senior', 'womens'], juniors: true,
    })
  })
  it('garbage, overflow and unknown values fall back without throwing', () => {
    const p = parseStatsParams({ season: 'Summer 1999/00', grade: '<script>', metric: 'nope', cat: 'x,y', group: 'zzz', juniors: 'yes' }, known)
    expect(p).toMatchObject({ season: 'all', grade: 'all', metric: 'runs', cats: null, juniors: false })
    expect(parseStatsParams({ season: 'x'.repeat(5000), metric: 'm'.repeat(5000) }, known).season).toBe('all')
  })
  it('duplicate keys use the first value; a group alone picks its first metric', () => {
    expect(parseStatsParams({ metric: ['wickets', 'runs'] }, known).metric).toBe('wickets')
    expect(parseStatsParams({ group: 'fielding' }, known)).toMatchObject({ metric: 'catches', group: 'fielding' })
    expect(parseStatsParams({ group: 'bowling', metric: 'runs' }, known).group).toBe('batting')
  })
})

describe('effectiveCategories', () => {
  const defaults = ['senior', 'womens', 'masters', 'mixed'] as const
  it('uses the site default, an explicit cat, and adds junior for ?juniors=1', () => {
    expect(effectiveCategories({ cats: null, juniors: false }, defaults)).toEqual(['senior', 'womens', 'masters', 'mixed'])
    expect(effectiveCategories({ cats: ['masters'], juniors: false }, defaults)).toEqual(['masters'])
    expect(effectiveCategories({ cats: null, juniors: true }, defaults)).toContain('junior')
  })
})

describe('statsHref', () => {
  it('omits defaults and sorts keys canonically', () => {
    expect(statsHref('/stats', {})).toBe('/stats')
    expect(statsHref('/stats', { metric: 'wickets', season: 'Summer 2025/26', grade: 'all' })).toBe('/stats?metric=wickets&season=Summer+2025%2F26')
  })
})

describe('csv', () => {
  it.each(['=1+1', '+1', '-1+2', '@SUM(A1)', '\tx', '\rx'])('prefixes a quote on string %j', (s) => {
    expect(csvCell(s).replace(/^"/, '').startsWith("'")).toBe(true)
  })
  it('leaves numbers, including negatives, alone', () => {
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(12.5)).toBe('12.5')
    expect(csvCell(NaN)).toBe('')
    expect(csvCell(null)).toBe('')
  })
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('l1\nl2')).toBe('"l1\nl2"')
  })
  it('joins with CRLF and a trailing newline', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, '=y']])).toBe("a,b\r\n1,x\r\n2,'=y\r\n")
  })
})
