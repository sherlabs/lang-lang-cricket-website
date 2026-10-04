import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildImportedBundle } from '@/lib/history-import/bundle'
import { parseCsv } from '@/lib/history-import/csv-parse'
import { parseMatchRows, seasonOfDate } from '@/lib/history-import/match-rows'
import { templateCsv } from '@/lib/history-import/templates'

const fixture = (name: string) => readFileSync(path.resolve(__dirname, 'fixtures/history-import', name), 'utf8')
const parse = (text: string, today = '2026-10-04') => {
  const c = parseCsv(text)
  if (!c.ok) throw new Error(c.error)
  return parseMatchRows(c, today)
}

describe('seasonOfDate', () => {
  it('starts a season in July', () => {
    expect(seasonOfDate('2013-02-10')).toEqual({ startYear: 2012, name: '2012/13' })
    expect(seasonOfDate('2012-10-01')).toEqual({ startYear: 2012, name: '2012/13' })
    expect(seasonOfDate('1999-12-31').name).toBe('1999/00')
  })
})

describe('match rows import', () => {
  it('groups the valid fixture into games, keeping a double-header apart', () => {
    const r = parse(fixture('match-rows-valid.csv'))
    expect(r.issues).toEqual([])
    expect(r.games).toHaveLength(4)
    const ids = new Set(r.games.map((g) => g.gameId))
    expect(ids.size).toBe(4)
    const refs = r.games.filter((g) => g.date === '2013-02-16').map((g) => g.gameRef).sort()
    expect(refs).toEqual(['R1', 'R2'])
    const g1 = r.games.find((g) => g.date === '2013-02-09')!
    expect(g1).toMatchObject({ teamRuns: 201, teamWickets: 7, oppRuns: 188, oppWickets: 10, result: 'won', format: 'one_day', seasonName: '2012/13' })
    expect(g1.players).toHaveLength(3)
  })

  it('names the row and reason for each problem in the error fixture', () => {
    const r = parse(fixture('match-rows-errors.csv'))
    const msg = (row: number) => r.issues.filter((i) => i.row === row).map((i) => i.message).join(' | ')
    expect(msg(2)).toContain('not a date')
    expect(msg(3)).toContain('junior')
    expect(msg(4)).toContain('not a way of getting out')
        expect(msg(6)).toContain('different values')
    expect(msg(8)).toContain('game_ref')
    expect(msg(9)).toContain('Remove the example rows')
    expect(msg(10)).toContain('0 balls')
  })

  it('refuses a future date', () => {
    const r = parse('date,grade,team,opponent,first_name\n2030-01-01,A,A,B,Pat\n', '2026-10-04')
    expect(r.issues[0].message).toContain('future')
  })

  it('refuses the same player twice in one game', () => {
    const r = parse('date,grade,team,opponent,first_name,last_name\n2013-02-09,A,A,B,Pat,One\n2013-02-09,A,A,B,Pat,One\n')
    expect(r.issues.some((i) => i.message.includes('already listed'))).toBe(true)
  })

  it('has no fielding columns: catches, run outs and stumpings are not importable', () => {
    const r = parse('date,grade,team,opponent,first_name,catches\n')
    expect(r.issues.some((i) => i.message.includes('Unknown column "catches"'))).toBe(true)
  })

  it('a re-parse gives the same game ids and bundle hashes', () => {
    const a = parse(fixture('match-rows-valid.csv')).games.map((g) => buildImportedBundle(g).sourceHash)
    const b = parse(fixture('match-rows-valid.csv')).games.map((g) => buildImportedBundle(g).sourceHash)
    expect(a).toEqual(b)
  })

  it('the bundle carries no opponent people and records only what was given', () => {
    const g = parse(fixture('match-rows-valid.csv')).games.find((x) => x.date === '2012-12-01')!
    const b = buildImportedBundle(g)
    expect(b.appearances.every((a) => a.isClubSide)).toBe(true)
    expect(b.fielding).toEqual([])
    const [club, opp] = b.innings
    expect(club.totalRuns).toBeNull()
    expect(opp.hasBallData).toBe(false)
    expect(b.batting[0]).toMatchObject({ battingStatus: 'out', dismissalType: 'run_out', balls: null, bowlerAppearanceId: null, position: 0 })
    expect(b.match).toMatchObject({ status: 'FINAL', result: 'draw', type: 'twoDay', days: 2, opponentOrgId: null })
  })

  it('the template parses as nothing but example rows to remove', () => {
    const r = parse(templateCsv('match-rows'))
    expect(r.games).toEqual([])
    expect(r.issues.length).toBeGreaterThan(0)
    expect(r.issues.every((i) => i.message.includes('Remove the example rows'))).toBe(true)
  })
})

describe('seasonOfDate with club config', () => {
  it('follows the configured start month and name format', () => {
    expect(seasonOfDate('2013-04-10', { startMonth: 1, format: 'single' })).toEqual({ startYear: 2013, name: '2013' })
    expect(seasonOfDate('2013-04-10', { startMonth: 9, format: 'split' })).toEqual({ startYear: 2012, name: '2012/13' })
  })
})
