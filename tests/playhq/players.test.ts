import { describe, it, expect } from 'vitest'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import { mapScorecard } from '@/lib/playhq/scorecard'
import { aggregatePlayers, oversToBalls, ballsToOvers } from '@/lib/playhq/players'
import type { RawGameSummary } from '@/lib/playhq/types'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const LL_B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const sc = mapScorecard(twoDay.data as RawGameSummary, ORG, false)

describe('overs arithmetic', () => {
  it('converts', () => {
    expect(oversToBalls(13.3)).toBe(81); expect(oversToBalls(22)).toBe(132); expect(oversToBalls(0.5)).toBe(5)
    expect(ballsToOvers(81)).toBe('13.3'); expect(ballsToOvers(132)).toBe('22'); expect(ballsToOvers(0)).toBe('0')
  })
})

describe('aggregatePlayers', () => {
  it('aggregates one team across one game', () => {
    const stats = aggregatePlayers([sc], LL_B)
    expect(stats.length).toBeGreaterThanOrEqual(11)
    expect(stats[0].batting.runs).toBeGreaterThanOrEqual(stats[1].batting.runs)
    const bailey = stats.find((p) => p.name.endsWith('Bailey'))
    expect(bailey).toBeUndefined()   // Bailey plays for Nar Nar Goon
    const total = stats.reduce((n, p) => n + p.batting.runs, 0)
    expect(total).toBe(83 - sc.innings[1].extras.total)
  })
  it('doubles when same game counted twice, keys on name', () => {
    const once = aggregatePlayers([sc], LL_B), twice = aggregatePlayers([sc, sc], LL_B)
    expect(twice[0].games).toBe(2); expect(twice[0].batting.runs).toBe(once[0].batting.runs * 2)
  })
  it('average is null with no dismissals, HS tracks not-out', () => {
    const s = aggregatePlayers([sc], LL_B)
    for (const p of s) {
      if (p.batting.innings - p.batting.notOuts === 0) expect(p.batting.average).toBeNull()
      else expect(p.batting.average).toBeCloseTo(p.batting.runs / (p.batting.innings - p.batting.notOuts), 2)
    }
  })
  it('bowling: overs summed in balls, best figures, economy', () => {
    const od = mapScorecard(oneDay.data as RawGameSummary, ORG, false)
    const s = aggregatePlayers([od, sc], '4398ce96-6b78-48af-8623-c208f8ceca9f')
    const bowler = s.find((p) => p.bowling.balls > 0)!
    expect(bowler.bowling.overs).toBe(ballsToOvers(bowler.bowling.balls))
    expect(bowler.bowling.economy).toBeCloseTo(bowler.bowling.runs / (bowler.bowling.balls / 6), 2)
    // Nadeera Fernando bowled 6-0-18-3 in the one-day fixture (from the raw JSON)
    const nf = s.find((p) => p.name === 'Nadeera Fernando')!
    expect(nf.bowling).toMatchObject({ balls: 36, overs: '6', runs: 18, wickets: 3, bestWickets: 3, bestRuns: 18, economy: 3, average: 6 })
  })
  it('ignores non-FINAL games and catches count', () => {
    expect(aggregatePlayers([{ ...sc, status: 'UPCOMING' }], LL_B)).toEqual([])
    const s = aggregatePlayers([sc], LL_B)
    expect(s.reduce((n, p) => n + p.catches, 0)).toBeGreaterThan(0)
  })
})

describe('junior aggregation', () => {
  it('uses First L. names and still attributes catches', () => {
    const j = mapScorecard(twoDay.data as RawGameSummary, ORG, true)
    const stats = aggregatePlayers([j], LL_B, true)
    expect(stats.length).toBeGreaterThanOrEqual(11)
    for (const p of stats) expect(p.name).toMatch(/^[^\s]+(?: [^\s]+)* [A-Z]\.$/)
    const senior = aggregatePlayers([sc], LL_B)
    expect(stats.reduce((n, p) => n + p.catches, 0)).toBe(senior.reduce((n, p) => n + p.catches, 0))
    expect(stats.reduce((n, p) => n + p.catches, 0)).toBeGreaterThan(0)
  })
})

describe('coaches', () => {
  it('a coach appearance never becomes a player row', () => {
    const raw = twoDay.data as RawGameSummary
    const coach = raw.appearances.find((a) => a.roleType === 'Coach')!
    const stats = aggregatePlayers([mapScorecard(raw, ORG, false)], coach.teamId)
    expect(stats.find((p) => p.key === `${coach.firstName}|${coach.lastName}`.toLowerCase())).toBeUndefined()
    const playerKeys = new Set(raw.appearances.filter((a) => a.roleType === 'Player').map((a) => `${a.firstName}|${a.lastName}`.toLowerCase()))
    for (const p of stats) expect(playerKeys.has(p.key), `${p.key} is not a Player`).toBe(true)
  })
})

describe('placeholder innings', () => {
  it('ignores unplayed 2nd innings (0 overs, openers not out 0) when counting innings / not-outs', () => {
    expect(sc.innings.length).toBe(4)
    const stats = aggregatePlayers([sc], LL_B)
    for (const p of stats) {
      expect(p.batting.innings).toBeLessThanOrEqual(1)
      expect(p.batting.notOuts).toBeLessThanOrEqual(1)
    }
    const notOutZero = stats.filter((p) => p.batting.innings === 1 && p.batting.notOuts === 1 && p.batting.balls === 0)
    expect(notOutZero).toEqual([])
  })
})
