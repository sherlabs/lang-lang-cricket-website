import { describe, expect, it } from 'vitest'
import { assembleFacts, deriveFacts, playerFacts } from '@/lib/stats/match/facts'
import { DEFAULT_MATCH_MINIMUMS } from '@/lib/stats/match/minimums'
import { headToHead, normaliseClubName, oppositionKey, oppositionTable } from '@/lib/stats/match/opposition'
import { mkBundle, playerId, everyone, type BundleSpec } from './match-facts-helpers'

const ref = (o: Partial<{ opponentOrgId: string | null; opponentOrgName: string | null; opponentName: string | null }>) => ({ opponentOrgId: null, opponentOrgName: null, opponentName: null, ...o })

describe('oppositionKey', () => {
  it('uses the organisation id when there is one', () => expect(oppositionKey(ref({ opponentOrgId: 'abc', opponentOrgName: 'X' }))).toBe('abc'))
  it('falls back to a normalised name, case, spacing and punctuation only', () => {
    expect(oppositionKey(ref({ opponentOrgName: '  Caldermeade   ROVERS. ' }))).toBe('n:caldermeade-rovers')
    expect(normaliseClubName("St. Mary's  C.C.")).toBe('st marys cc')
  })
  it('strips no words, so two different clubs never merge', () => {
    expect(oppositionKey(ref({ opponentOrgName: 'Foo Cricket Club' }))).not.toBe(oppositionKey(ref({ opponentOrgName: 'Foo' })))
    expect(oppositionKey(ref({ opponentOrgName: 'Foo A Grade' }))).not.toBe(oppositionKey(ref({ opponentOrgName: 'Foo' })))
  })
  it('is locale neutral: non-Latin names keep distinct keys', () => {
    const a = oppositionKey(ref({ opponentOrgName: 'Нева Клуб' })), b = oppositionKey(ref({ opponentOrgName: 'Дон Клуб' }))
    expect(a).not.toBe(b)
    expect(a).not.toBe('n:unknown')
  })
  it('an imported name key can never equal an org-id key, and falls back to the team name', () => {
    expect(oppositionKey(ref({ opponentName: 'Rivals A' }))).toBe('n:rivals-a')
    expect(oppositionKey(ref({}))).toBe('n:unknown')
  })
})

const game = (id: number, o: BundleSpec & { runs?: number; wkts?: number; out?: boolean } = {}): BundleSpec => ({
  id, gameId: `g${id}`, innings: [{ seq: 1, clubBatting: true, runs: o.runs ?? 100, wickets: o.wkts ?? 5, allOut: o.out ?? false, bat: [{ who: 'c1', pos: 1, runs: o.runs ?? 30, status: 'out', dismissal: 'bowled' }] }, { seq: 2, clubBatting: false, runs: 90, wickets: 10, allOut: true, bowl: [{ who: 'c1', balls: 36, runs: 30, wickets: 2 }] }], ...o,
})
const factsOf = (specs: BundleSpec[]) => assembleFacts(specs.map((s) => deriveFacts(mkBundle(s), everyone)!))

describe('oppositionTable', () => {
  it('shows an average only with enough innings against the opposition', () => {
    const specs = [1, 2, 3].map((i) => game(i, { runs: 30 + i }))
    const t = oppositionTable(playerFacts(factsOf(specs), playerId('c1')), DEFAULT_MATCH_MINIMUMS)
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ key: 'org-rivals', games: 3, battingInnings: 3, runs: 96, wickets: 6, bowlBalls: 108 })
    expect(t[0].average).toBeCloseTo(32)
    expect(t[0].economy).toBeCloseTo(30 / 6)
    const few = oppositionTable(playerFacts(factsOf(specs.slice(0, 1)), playerId('c1')), DEFAULT_MATCH_MINIMUMS)
    expect(few[0].average).toBeNull()
    expect(few[0].economy).toBeNull()
  })
  it('keeps imported (name keyed) opposition separate from PlayHQ opposition', () => {
    const t = oppositionTable(playerFacts(factsOf([game(1), game(2, { orgId: null, orgName: 'Rivals', oppName: 'Rivals A' })]), playerId('c1')), DEFAULT_MATCH_MINIMUMS)
    expect(t.map((r) => r.key).sort()).toEqual(['n:rivals', 'org-rivals'])
  })
})

describe('headToHead', () => {
  it('counts results, marks forfeits and excludes them from win percentage', () => {
    const specs: BundleSpec[] = [
      game(1, { result: 'won' }), game(2, { result: 'lost' }), game(3, { result: 'draw' }), game(4, { result: 'tie' }), game(5, { result: 'no_result' }),
      { id: 6, gameId: 'g6', result: 'won', forfeit: true, extra: ['c1'] }, { id: 7, gameId: 'g7', result: 'lost', forfeit: true, extra: ['c1'] },
    ]
    const [h] = headToHead(factsOf(specs), { winGames: 4 })
    expect(h).toMatchObject({ played: 7, won: 1, lost: 1, drawn: 1, tied: 1, noResult: 1, wonByForfeit: 1, lostByForfeit: 1 })
    expect(h.winPct).toBeCloseTo(25)
    expect(headToHead(factsOf(specs), { winGames: 5 })[0].winPct).toBeNull()
  })
  it('reports highest scores and the lowest completed innings only for innings that ended all out', () => {
    const specs = [game(1, { runs: 150, out: false }), game(2, { runs: 60, out: true }), game(3, { runs: 40, out: false })]
    const [h] = headToHead(factsOf(specs), DEFAULT_MATCH_MINIMUMS)
    expect(h.highestFor).toBe(150)
    expect(h.lowestCompletedFor).toBe(60)
    expect(h.highestAgainst).toBe(90)
    expect(h.lowestCompletedAgainst).toBe(90)
  })
  it('has no lowest completed innings when none ended all out', () => {
    const [h] = headToHead(factsOf([game(1, { runs: 40, out: false })].map((g) => ({ ...g, innings: g.innings!.slice(0, 1) }))), DEFAULT_MATCH_MINIMUMS)
    expect(h.lowestCompletedFor).toBeNull()
  })
  it('sorts by games played then label and follows the latest label', () => {
    const rows = headToHead(factsOf([game(1), game(2, { orgId: 'o2', orgName: 'Zeta' }), game(3, { orgId: 'o2', orgName: 'Alpha', date: '2025-12-01' }), game(4, { orgId: 'o3', orgName: 'Beta' })]), DEFAULT_MATCH_MINIMUMS)
    expect(rows.map((r) => r.label)).toEqual(['Alpha', 'Beta', 'Rivals'])
  })
})
