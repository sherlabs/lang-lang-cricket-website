import { describe, it, expect } from 'vitest'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import { mapScorecard, clubWickets, dismissalText } from '@/lib/playhq/scorecard'
import type { RawGameSummary } from '@/lib/playhq/types'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const NNG = '24a3079f-1d19-4fc6-984e-28df1ed4256d'
const sc = mapScorecard(twoDay.data as RawGameSummary, ORG, false)

describe('mapScorecard (two-day)', () => {
  it('header', () => {
    expect(sc.type).toBe('twoDay'); expect(sc.status).toBe('FINAL')
    expect(sc.gradeName).toBe('4. Senior Men B Grade'); expect(sc.roundName).toBe('Round 4')
    expect(sc.venueName).toBe('Nar Nar Goon Recreation Reserve')
    expect(sc.startsAt).toBe('2025-10-25T02:00:00.000Z')
    expect(sc.teams.find((t) => t.id === LL_B)?.isClub).toBe(true)
    expect(sc.teams.find((t) => t.id === NNG)?.isClub).toBe(false)
    expect(sc.toss).toBe('Lang Lang B Grade won the toss and elected to bowl')
  })
  it('innings in order with batting/bowling sides', () => {
    expect(sc.innings.map((i) => i.sequenceNo)).toEqual([1, 2, 3, 4])
    const i1 = sc.innings[0]
    expect(i1.battingTeamId).toBe(NNG); expect(i1.bowlingTeamId).toBe(LL_B)
    expect(i1.label).toBe('Nar Nar Goon B Grade — 1st innings')
    expect(sc.innings[2].label).toBe('Nar Nar Goon B Grade — 2nd innings')
  })
  it('totals, extras, declared / all out', () => {
    const i1 = sc.innings[0]
    expect(i1.total).toEqual({ runs: 237, wickets: 4, overs: 57, declared: true, allOut: false })
    expect(i1.extras).toEqual({ total: 18, wides: 8, noBalls: 4, byes: 2, legByes: 4, penalty: 0 })
    const i2 = sc.innings[1]
    expect(i2.total).toEqual({ runs: 83, wickets: 10, overs: 55.3, declared: false, allOut: true })
  })
  it('batting lines ordered by displayOrder, with dismissals', () => {
    const i2 = sc.innings[1]   // Lang Lang batting
    expect(i2.batting[0].name).toMatch(/de Longville$/i)
    expect(i2.batting[0]).toMatchObject({ runs: 0, balls: 32, fours: 0, sixes: 0, notOut: false })
    expect(i2.batting.map((b) => b.dismissal)).toSatisfy((d: string[]) => d.every((x) => /^(c .+ b .+|c & b .+|b .+|lbw b .+|not out|run out.*|st .+ b .+|out)$/.test(x)))
    const wykes = i2.batting.find((b) => b.name.endsWith('Wykes'))!
    expect(wykes.dismissal).toMatch(/^b /)
    expect(i2.batting.length + i2.didNotBat.length).toBeGreaterThanOrEqual(10)
  })
  it('fall of wickets joined to names', () => {
    const i1 = sc.innings[0]
    expect(i1.fallOfWickets[0]).toMatchObject({ wicket: 1, runs: 96 })
    expect(i1.fallOfWickets[0].name.length).toBeGreaterThan(2)
  })
  it('fall of wickets omits invisible appearances', () => {
    const raw = twoDay.data as RawGameSummary
    const firstFowId = raw.periods.find((p) => p.sequenceNo === 1)!.teams
      .find((t) => t.discipline === 'BATTING')!.fallOfWickets![0].appearanceId
    const hidden = { ...raw, appearances: raw.appearances.map((a) => (a.id === firstFowId ? { ...a, visible: false } : a)) }
    const s = mapScorecard(hidden, ORG, false)
    const i1 = s.innings[0]
    expect(i1.fallOfWickets.some((f) => f.wicket === 1 && f.runs === 96)).toBe(false)
    expect(i1.fallOfWickets.every((f) => f.name !== 'Unknown')).toBe(true)
  })
  it('bowling lines only for bowlers with overs', () => {
    const i2 = sc.innings[1]
    expect(i2.bowling.length).toBe(6)
    const bailey = i2.bowling.find((b) => b.name.endsWith('Bailey'))!
    expect(bailey).toMatchObject({ overs: 22, maidens: 13, runs: 20, wickets: 4, economy: 0.9 })
  })
  it('players map excludes invisible appearances', () => {
    const raw = twoDay.data as RawGameSummary
    const hidden = { ...raw, appearances: raw.appearances.map((a, i) => (i === 0 ? { ...a, visible: false } : a)) }
    const s = mapScorecard(hidden, ORG, false)
    expect(s.players[raw.appearances[0].id]).toBeUndefined()
    // fixture has one duplicate appearance id (e5000322-...), so unique ids < appearances.length
    const uniqueIds = new Set(raw.appearances.map((a) => a.id)).size
    expect(Object.keys(s.players).length).toBe(uniqueIds - 1)
  })
  it('junior flag abbreviates names', () => {
    const j = mapScorecard(twoDay.data as RawGameSummary, ORG, true)
    expect(j.innings[1].batting[0].name).toMatch(/^\S+ \S\.$/)
  })
  it('clubWickets for result sentence', () => {
    expect(clubWickets(sc, LL_B)).toEqual({ club: 10, opponent: 4, clubDeclared: false, opponentDeclared: true })
  })
})

describe('mapScorecard (one-day)', () => {
  const od = mapScorecard(oneDay.data as RawGameSummary, ORG, false)
  it('two innings, TOTAL_SCORE used', () => {
    expect(od.innings.length).toBe(2)
    expect(od.innings[0].total).toMatchObject({ runs: 88, wickets: 9, overs: 21.1, declared: false, allOut: false })
    expect(od.innings[0].didNotBat.length).toBe(1)
  })
})

describe('dismissalText', () => {
  const name = (id: string) => ({ b: 'Bowler', f: 'Fielder', x: 'Batter' })[id] ?? '?'
  const ev = (type: string, apps: [string, string][]) => ({ type, appearances: apps.map(([id, role]) => ({ id, role })) })
  it.each([
    [ev('CAUGHT', [['x', 'BATTING'], ['b', 'BOWLING'], ['f', 'FIELDING']]), 'c Fielder b Bowler'],
    [ev('CAUGHT', [['x', 'BATTING'], ['b', 'BOWLING'], ['b', 'FIELDING']]), 'c & b Bowler'],
    [ev('CAUGHT', [['x', 'BATTING'], ['b', 'BOWLING']]), 'c ? b Bowler'],
    [ev('BOWLED', [['x', 'BATTING'], ['b', 'BOWLING']]), 'b Bowler'],
    [ev('LEG_BEFORE_WICKET', [['x', 'BATTING'], ['b', 'BOWLING']]), 'lbw b Bowler'],
    [ev('STUMPED', [['x', 'BATTING'], ['b', 'BOWLING'], ['f', 'FIELDING']]), 'st Fielder b Bowler'],
    [ev('RUN_OUT', [['x', 'BATTING'], ['f', 'FIELDING']]), 'run out (Fielder)'],
    [ev('RUN_OUT', [['x', 'BATTING']]), 'run out'],
    [ev('HIT_WICKET', [['x', 'BATTING'], ['b', 'BOWLING']]), 'hit wicket b Bowler'],
    [ev('RETIRED_HURT', [['x', 'BATTING']]), 'retired hurt'],
    [ev('OBSTRUCTING_FIELD', [['x', 'BATTING']]), 'obstructing field'],
  ])('%o → %s', (event, expected) => expect(dismissalText(event as never, 'OUT', name)).toBe(expected))
  it('not out / out without event', () => {
    expect(dismissalText(undefined, 'NOT_OUT', name)).toBe('not out')
    expect(dismissalText(undefined, 'OUT', name)).toBe('out')
  })
})
