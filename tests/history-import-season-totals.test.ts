import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/history-import/csv-parse'
import { parseSeason, parseSeasonTotals } from '@/lib/history-import/season-totals'
import { templateCsv } from '@/lib/history-import/templates'

const fixture = (name: string) => readFileSync(path.resolve(__dirname, 'fixtures/history-import', name), 'utf8')
const parse = (text: string) => {
  const c = parseCsv(text)
  if (!c.ok) throw new Error(c.error)
  return parseSeasonTotals(c)
}

describe('parseSeason', () => {
  it('accepts 2012/13 only with the right second year', () => {
    expect(parseSeason('2012/13')).toBe(2012)
    expect(parseSeason('1999/00')).toBe(1999)
    expect(parseSeason('2012/14')).toBeNull()
    expect(parseSeason('2012-13')).toBeNull()
    expect(parseSeason('Summer 2012/13')).toBeNull()
  })
})

describe('season totals import', () => {
  it('parses the valid fixture with the unballed rule', () => {
    const r = parse(fixture('season-totals-valid.csv'))
    expect(r.issues).toEqual([])
    expect(r.rows).toHaveLength(3)
    const [a, b, c] = r.rows
    expect(a.nameKey).toBe('alex|demoson')
    expect(a.counts).toMatchObject({ batBalls: 530, batRunsUnballed: 0, bowlBalls: 61 * 6 + 3, bowlBestWickets: 3, catches: 5 })
    expect(a.unballed).toBe(false)
    // Blank balls, fours and sixes mean "not recorded": zeros, with every run unballed.
    expect(b.unballed).toBe(true)
    expect(b.counts).toMatchObject({ batBalls: 0, batFours: 0, batSixes: 0, batRunsUnballed: 205, batHighScoreNotOut: true })
    expect(c.counts.bowlBalls).toBe(240)
    expect(c.season).toBe('2011/12')
  })

  it('names the row, column and reason for every problem in the error fixture', () => {
    const r = parse(fixture('season-totals-errors.csv'))
    expect(r.rows).toEqual([])
    const by = (row: number) => r.issues.filter((i) => i.row === row)
    expect(by(2)[0]).toMatchObject({ column: 'season', message: expect.stringContaining('2012/13') })
    expect(by(3)[0]).toMatchObject({ column: 'bat_high_score', message: expect.stringContaining('more than the total runs') })
    expect(by(4)[0]).toMatchObject({ column: 'bat_not_outs', message: expect.stringContaining('more than innings') })
    expect(by(5)[0]).toMatchObject({ message: expect.stringContaining('junior') })
    expect(by(6)[0]).toMatchObject({ message: expect.stringContaining('Remove the example rows') })
    expect(by(7)[0]).toMatchObject({ column: 'team', message: expect.stringContaining('formula') })
    expect(by(8)[0]).toMatchObject({ column: 'bowl_overs', message: expect.stringContaining('0 to 5 balls') })
    expect(by(9)[0]).toMatchObject({ column: 'best_wickets', message: expect.stringContaining('0 wickets') })
  })

  it('rejects an unknown or missing header and a comment row', () => {
    expect(parse('season,team,first_name,games,nonsense\n').issues.some((i) => i.message.includes('Unknown column'))).toBe(true)
    expect(parse('season,team\n').issues.some((i) => i.message.includes('is missing'))).toBe(true)
    const r = parse('season,team,first_name,games\n# note,x,y,1\n')
    expect(r.issues).toEqual([{ row: 2, column: null, message: 'A row may not start with #. Delete the note line.' }])
  })

  it('refuses a player listed twice for the same team and season', () => {
    const r = parse('season,team,first_name,last_name,games\n2012/13,A,Pat,One,5\n2012/13,A,Pat,One,6\n')
    expect(r.rows).toHaveLength(1)
    expect(r.issues[0]).toMatchObject({ row: 3, message: expect.stringContaining('row 2') })
  })

  it('skips exported PlayHQ rows so an export re-imports', () => {
    const r = parse('season,team,first_name,last_name,games,source\n2024/25,A,Pat,One,5,playhq\n2012/13,A,Pat,One,5,import\n')
    expect(r.ignored).toBe(1)
    expect(r.rows).toHaveLength(1)
  })

  it('the template parses as nothing but example rows to remove', () => {
    const r = parse(templateCsv('season-totals'))
    expect(r.rows).toEqual([])
    expect(r.issues).toHaveLength(2)
    expect(r.issues.every((i) => i.message.includes('Remove the example rows'))).toBe(true)
  })
})
