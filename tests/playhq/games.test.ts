import { describe, it, expect } from 'vitest'
import bGrade from '../fixtures/playhq/team-fixture-b-grade-2025-26.json'
import oneDay from '../fixtures/playhq/team-fixture-one-day-2025-26.json'
import upcoming from '../fixtures/playhq/team-fixture-b-grade-2026-27.json'
import { mapGame, resultSentence, isFinished, sortUpcoming, sortResults, dedupeGames } from '@/lib/playhq/games'
import type { RawFixtureGame } from '@/lib/playhq/types'

const B = '61e6c836-a80b-49f1-ae65-625bd0f55016'
const OD = '4398ce96-6b78-48af-8623-c208f8ceca9f'
const B27 = '9ad1241c-0f78-418e-b9f6-e0e74bff69a0'
const ids = new Set([B, OD, B27])
const bGames = (bGrade.data as RawFixtureGame[]).map((g) => mapGame(g, ids)!)
const round = (n: string) => bGames.find((g) => g.roundName === n)!

describe('mapGame', () => {
  it('maps a two-day first-innings loss', () => {
    const g = round('Round 4')
    expect(g.id).toBe('a65c84a6-1389-4b1c-89bd-98e66625b35f')
    expect(g.club).toEqual({ id: B, name: 'Lang Lang B Grade', isHome: false, outcome: 'LOST_ON_FIRST_INNINGS', score: 83 })
    expect(g.opponent.name).toBe('Nar Nar Goon B Grade')
    expect(g.opponent.score).toBe(237)
    expect(g.localDate).toBe('2025-10-25'); expect(g.localTime).toBe('13:00:00')
    expect(g.sortKey).toBe('2025-10-25T13:00:00')
    expect(g.venueName).toBe('Nar Nar Goon Recreation Reserve'); expect(g.venueSuburb).toBe('NAR NAR GOON')
    expect(g.gradeName).toBe('4. Senior Men B Grade'); expect(g.roundAbbr).toBe('R4')
    expect(g.isClubDerby).toBe(false)
  })
  it('handles upcoming games with no outcome/score', () => {
    const g = mapGame(upcoming.data[0] as RawFixtureGame, ids)!
    expect(g.status).toBe('UPCOMING')
    expect(g.club).toEqual({ id: B27, name: 'Lang Lang B Grade', isHome: true, outcome: null, score: null })
    expect(isFinished(g)).toBe(false)
  })
  it('returns null when no club team plays', () => {
    expect(mapGame(upcoming.data[0] as RawFixtureGame, new Set(['nope']))).toBeNull()
  })
  it('flags club derbies', () => {
    const raw = upcoming.data[0] as RawFixtureGame
    const derby = { ...raw, competitors: raw.competitors.map((c) => ({ ...c, id: c.id === B27 ? B27 : OD })) }
    expect(mapGame(derby, ids)!.isClubDerby).toBe(true)
  })
  it('abandoned game is finished', () => expect(isFinished(round('Round 11'))).toBe(true))
})

describe('resultSentence', () => {
  it('first-innings loss, with wickets', () => {
    expect(resultSentence(round('Round 4'), { club: 10, opponent: 4, opponentDeclared: true }))
      .toBe('Lang Lang B Grade 83 lost to Nar Nar Goon B Grade 4/237 dec on first innings')
  })
  it('outright loss without wickets', () => {
    expect(resultSentence(round('Round 1'))).toBe('Lang Lang B Grade 50 lost to Merinda Park B Grade 52')
  })
  it('win', () => {
    const g = (oneDay.data as RawFixtureGame[]).map((x) => mapGame(x, ids)!).find((x) => x.club.outcome === 'WON')!
    expect(resultSentence(g)).toMatch(/^Lang Lang One Day \d+ defeated .+ \d+$/)
  })
  it('forfeit / abandoned / upcoming', () => {
    const od = (oneDay.data as RawFixtureGame[]).map((x) => mapGame(x, ids)!)
    expect(resultSentence(od.find((x) => x.club.outcome === 'WON_BY_FORFEIT')!)).toMatch(/won by forfeit$/)
    expect(resultSentence(od.find((x) => x.club.outcome === 'LOST_BY_FORFEIT')!)).toMatch(/lost by forfeit$/)
    expect(resultSentence(round('Round 11'))).toBe('Match abandoned')
    expect(resultSentence(mapGame(upcoming.data[0] as RawFixtureGame, ids)!)).toBe('')
  })
})

describe('sorting & dedupe', () => {
  it('sorts', () => {
    expect(sortUpcoming(bGames)[0].roundName).toBe('Round 1')
    expect(sortResults(bGames)[0].roundName).toBe('Round 14')
  })
  it('dedupes by id', () => expect(dedupeGames([...bGames, ...bGames]).length).toBe(bGames.length))
})
