import { describe, expect, it } from 'vitest'
import type { Game } from '@/lib/playhq/types'
import { assembleFacts, deriveFacts } from '@/lib/stats/match/facts'
import {
  inningsText, matchAllRounders, oversText, progressionByGrade, resultLetter, resultLineOf, resultsByGradeFromLines, resultWord, shareText, sideScore, storedShare,
  type ResultLine,
} from '@/lib/stats/match/yearbook'
import { everyone, mkBundle } from './match-facts-helpers'

const line = (o: Partial<ResultLine> = {}): ResultLine => ({
  gameId: 'g', date: '2025-10-11', round: 'Round 1', isFinalRound: false, grade: 'A Grade', team: 'A', opponent: 'Rivals', format: 'oneDay',
  result: 'won', forfeit: false, onFirstInnings: false, club: [{ seq: 1, runs: 150, wickets: 6, balls: 240, declared: false, allOut: false }], opp: [{ seq: 2, runs: 120, wickets: 10, balls: 200, declared: false, allOut: true }], ...o,
})

describe('score text', () => {
  it('formats overs, wickets, declarations and two-day games', () => {
    expect(oversText(245)).toBe('40.5')
    expect(inningsText({ seq: 1, runs: 152, wickets: 6, balls: 240, declared: false, allOut: false })).toBe('152/6 (40.0 ov)')
    expect(inningsText({ seq: 1, runs: 200, wickets: 5, balls: 0, declared: true, allOut: false })).toBe('200/5d')
    expect(sideScore([{ seq: 1, runs: 200, wickets: 5, balls: 300, declared: true, allOut: false }, { seq: 3, runs: 80, wickets: 2, balls: 120, declared: false, allOut: false }])).toBe('200/5d (50.0 ov) & 80/2 (20.0 ov)')
    expect(sideScore([])).toBe('–')
  })
})

describe('result letters and words', () => {
  it('maps results to W L D T N and spells forfeits and first-innings results', () => {
    expect(['won', 'lost', 'draw', 'tie', 'no_result', null].map((r) => resultLetter({ result: r as ResultLine['result'] }))).toEqual(['W', 'L', 'D', 'T', 'N', 'N'])
    expect(resultWord({ result: 'won', forfeit: true, onFirstInnings: false })).toBe('Won by forfeit')
    expect(resultWord({ result: 'lost', forfeit: false, onFirstInnings: true })).toBe('Lost on first innings')
    expect(resultWord({ result: 'draw', forfeit: false, onFirstInnings: false })).toBe('Drawn')
  })
})

describe('resultLineOf', () => {
  it('reads scores of played innings only, club and opposition, and skips non-FINAL', () => {
    const b = mkBundle({ type: 'twoDay', innings: [
      { seq: 1, clubBatting: true, runs: 210, wickets: 5 }, { seq: 2, clubBatting: false, runs: 150, wickets: 10 },
      { seq: 3, clubBatting: true, runs: 0, wickets: 0, played: false },
    ] })
    const l = resultLineOf(b)!
    expect(l.club.map((i) => i.runs)).toEqual([210])
    expect(l.opp.map((i) => i.runs)).toEqual([150])
    expect(l.opponent).toBe('Rivals')
    expect(resultLineOf(mkBundle({ status: 'IN_PROGRESS' }))).toBeNull()
  })
})

describe('results by grade and progression', () => {
  const lines = [
    line({ gameId: 'a', date: '2025-10-11', result: 'won' }),
    line({ gameId: 'b', date: '2025-10-18', result: 'lost' }),
    line({ gameId: 'c', date: '2025-10-25', result: 'lost' }),
    line({ gameId: 'd', date: '2025-11-01', result: 'draw' }),
    line({ gameId: 'e', date: '2025-11-08', result: 'won', forfeit: true }),
    line({ gameId: 'f', date: '2025-10-12', grade: 'B Grade', result: 'won' }),
  ]
  it('groups by grade with games newest first', () => {
    const g = resultsByGradeFromLines(lines)
    expect(g.map((x) => x.grade)).toEqual(['A Grade', 'B Grade'])
    expect(g[0].lines.map((l) => l.gameId)).toEqual(['e', 'd', 'c', 'b', 'a'])
  })
  it('keeps the running wins minus losses level on a draw and counts a forfeit as the result it was', () => {
    const a = progressionByGrade(lines).find((p) => p.grade === 'A Grade')!
    expect(a.cells.map((c) => c.letter).join('')).toBe('WLLDW')
    expect(a.cells.map((c) => c.net)).toEqual([1, 0, -1, -1, 0])
    expect(a.cells[4].forfeit).toBe(true)
  })
  it('applies the grade label function', () => {
    const g = resultsByGradeFromLines(lines, (x) => (x ? x.toUpperCase() : x))
    expect(g[0].grade).toBe('A GRADE')
  })
})

describe('stored share (spec 5.5)', () => {
  const live = (id: string, status = 'FINAL', derby = false) => ({ id, status, isClubDerby: derby }) as unknown as Game
  it('is complete when every live finished game is stored', () => {
    const s = storedShare([line({ gameId: 'a' }), line({ gameId: 'b' })], [live('a'), live('b'), live('x', 'ABANDONED'), live('y', 'UPCOMING'), live('d', 'FINAL', true)])
    expect(s).toEqual({ stored: 2, live: 2, complete: true })
    expect(shareText(s)).toBe('2 of 2 finished games stored.')
  })
  it('is incomplete when a finished game is missing, and the sources are not mixed', () => {
    const s = storedShare([line({ gameId: 'a' })], [live('a'), live('b')])
    expect(s.complete).toBe(false)
    expect(shareText(s)).toBe('1 of 2 finished games stored.')
  })
  it('uses stored data when there is no live list, and nothing when nothing is stored', () => {
    expect(storedShare([line()], null)).toEqual({ stored: 1, live: null, complete: true })
    expect(storedShare([], null).complete).toBe(false)
    expect(shareText({ stored: 1, live: null, complete: true })).toBe('1 finished game stored.')
  })
})

describe('all-rounders from match data', () => {
  const bundle = (id: number, runs: number, wkts: number) => mkBundle({ id, gameId: `g${id}`, innings: [
    { seq: 1, clubBatting: true, runs: 300, wickets: 3, bat: [{ who: 'c1', pos: 1, runs, status: 'out', dismissal: 'bowled' }] },
    { seq: 2, clubBatting: false, runs: 200, wickets: 5, bowl: [{ who: 'c1', balls: 48, runs: 30, wickets: wkts }] },
  ] })
  const set = assembleFacts([bundle(1, 60, 4), bundle(2, 50, 5)].map((b) => deriveFacts(b, everyone)!))
  it('applies the same minimums and score as the season-total block', () => {
    const r = matchAllRounders(set)
    expect(r).toEqual([{ playerId: 101, runs: 110, wickets: 9, score: 290, rank: 1 }])
    expect(matchAllRounders(assembleFacts([deriveFacts(bundle(1, 60, 4), everyone)!]))).toEqual([])
  })
})
