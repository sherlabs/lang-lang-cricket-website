import { describe, expect, it } from 'vitest'
import { assembleFacts, deriveFacts, filterFacts, mergeFactSets, playerFacts, splitByPlayer } from '@/lib/stats/match/facts'
import { mkBundle, playerId, visible, everyone } from './match-facts-helpers'

const inn = { seq: 1, clubBatting: true, runs: 100, wickets: 2, bat: [{ who: 'c1', pos: 1, runs: 40 }, { who: 'c2', pos: 2, runs: 30 }, { who: 'c3', pos: 3, status: 'did_not_bat' as const }] }

describe('deriveFacts (spec 2.1)', () => {
  it('ignores a match that is not FINAL', () => expect(deriveFacts(mkBundle({ status: 'IN_PROGRESS', innings: [inn] }), everyone)).toBeNull())

  it('produces no fact for a hidden or unresolved club player, anywhere', () => {
    const f = deriveFacts(mkBundle({ innings: [inn], extra: ['c3'] }), visible('c1', 'c3'))!
    expect(f.bat.map((r) => r.player)).toEqual([101])
    expect(f.appearances.map((a) => a.player).sort()).toEqual([101, 103])
  })

  it('counts a forfeit game as an appearance but gives it no innings', () => {
    const f = deriveFacts(mkBundle({ forfeit: true, result: 'won', extra: ['c1', 'c2'], innings: [] }), everyone)!
    expect(f.appearances).toHaveLength(2)
    expect(f.innings).toEqual([])
    expect(f.header).toMatchObject({ forfeit: true, result: 'won' })
  })

  it('drops the unplayed placeholder innings', () => {
    const f = deriveFacts(mkBundle({ innings: [inn, { ...inn, seq: 3, played: false }] }), everyone)!
    expect(f.innings.map((i) => i.seq)).toEqual([1])
  })

  it('carries the opposition key and label and never an opposition person', () => {
    const f = deriveFacts(mkBundle({ innings: [{ seq: 1, clubBatting: false, runs: 10, wickets: 1, bat: [{ who: 'o1', pos: 1, dismissal: 'bowled', bowler: 'c1' }], bowl: [{ who: 'c1', wickets: 1 }] }] }), everyone)!
    expect(f.header).toMatchObject({ oppKey: 'org-rivals', oppLabel: 'Rivals' })
    expect(JSON.stringify(f)).not.toMatch(/Opp o1/)
  })
})

describe('fact sets', () => {
  const a = assembleFacts([deriveFacts(mkBundle({ id: 1, gameId: 'g1', grade: 'A', innings: [inn] }), everyone)!])
  const b = assembleFacts([deriveFacts(mkBundle({ id: 2, gameId: 'g2', grade: 'B', innings: [{ ...inn, bat: [{ who: 'c1', pos: 1, runs: 5 }] }] }), everyone)!])
  const both = mergeFactSets([a, b])

  it('filters by match and keeps every row of the kept matches only', () => {
    const only = filterFacts(both, (h) => h.grade === 'B')
    expect(only.matches.size).toBe(1)
    expect(only.bat).toHaveLength(1)
    expect(only.innings.size).toBe(1)
  })
  it('slices one player and splits all players', () => {
    expect(playerFacts(both, playerId('c2')).bat).toHaveLength(1)
    expect(playerFacts(both, playerId('c1')).matches.size).toBe(2)
    expect(splitByPlayer(both).get(101)!.bat).toHaveLength(2)
    expect(playerFacts(both, 999).appearances).toEqual([])
  })
})
