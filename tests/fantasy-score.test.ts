import { describe, expect, it } from 'vitest'
import { assembleFacts, deriveFacts } from '../lib/stats/match/facts'
import { DEFAULT_SCORING, resolveRules } from '../lib/fantasy/rules'
import { isNoResultHeader, pointsForMatches, roundPoints, scorePlayerGame, scoringMatchIds, withCaptain } from '../lib/fantasy/score'
import { buildLeaderboard, squadFor } from '../lib/fantasy/leaderboard'
import { everyone, mkBundle, playerId, type BundleSpec } from './match-facts-helpers'

const T = DEFAULT_SCORING
const facts = (specs: BundleSpec[]) => assembleFacts(specs.flatMap((s, i) => { const f = deriveFacts(mkBundle({ id: i + 1, gameId: `g${i + 1}`, ...s }), everyone, i + 1); return f ? [f] : [] }))
const all = (set: ReturnType<typeof facts>) => new Set([...set.appearances.map((a) => a.player)])

// Saturday 2025-10-11 game: a duck, a fifty, a hundred with no boundary counts, a five-for, a keeper and a stumper.
const SAT: BundleSpec = {
  date: '2025-10-11',
  innings: [
    {
      seq: 1, clubBatting: true,
      bat: [
        { who: 'c1', pos: 1, status: 'out', runs: 0, fours: 0, sixes: 0, dismissal: 'bowled' },
        { who: 'c2', pos: 2, status: 'out', runs: 52, fours: 3, sixes: 1, dismissal: 'lbw' },
        { who: 'c3', pos: 3, status: 'not_out', runs: 105, fours: null, sixes: null },
      ],
    },
    {
      seq: 2, clubBatting: false,
      bat: [
        { who: 'o1', pos: 1, status: 'out', dismissal: 'bowled', bowler: 'c4' },
        { who: 'o2', pos: 2, status: 'out', dismissal: 'bowled', bowler: 'c4' },
        { who: 'o3', pos: 3, status: 'out', dismissal: 'bowled', bowler: 'c4' },
        { who: 'o4', pos: 4, status: 'out', dismissal: 'bowled', bowler: 'c4' },
        { who: 'o5', pos: 5, status: 'out', dismissal: 'caught_and_bowled', bowler: 'c4' },
        { who: 'o6', pos: 6, status: 'out', dismissal: 'caught', bowler: 'c9', fielder: 'c5' },
        { who: 'o7', pos: 7, status: 'out', dismissal: 'caught', bowler: 'c9', fielder: 'c8' },
      ],
      bowl: [{ who: 'c4', wickets: 5, maidens: 2 }, { who: 'c9', wickets: 2 }],
      field: [{ who: 'c5', catches: 1, keeper: 1 }, { who: 'c7', stumpings: 1 }],
    },
  ],
  extra: ['c6'],
}

describe('scorePlayerGame', () => {
  const set = facts([SAT])
  const pts = roundPoints(set, '2025-10-11', T, all(set))
  const of = (who: string) => pts.get(playerId(who))

  it('a duck is out for 0 and costs 3 on top of the appearance', () => expect(of('c1')?.points).toBe(2 - 3))
  it('a fifty adds the fifty bonus and boundaries when recorded', () => expect(of('c2')?.points).toBe(2 + 52 + 3 + 2 + 8))
  it('a hundred is cumulative with the fifty and null boundaries score nothing', () => {
    const c3 = of('c3')!
    expect(c3.points).toBe(2 + 105 + 8 + 16)
    expect(c3.parts.map((p) => p.key)).not.toContain('four')
    expect(c3.parts.map((p) => p.key)).not.toContain('six')
  })
  it('a five-for adds the three and five wicket bonuses, maidens, and the caught-and-bowled catch', () => expect(of('c4')?.points).toBe(2 + 5 * 20 + 2 * 6 + 6 + 12 + 8))
  it('a keeper catch scores once: catches already include it, keeperCatches adds nothing', () => expect(of('c5')?.points).toBe(2 + 8))
  it('a null stumping or run-out count scores nothing, a recorded one does', () => {
    expect(of('c8')?.points).toBe(2 + 8)
    expect(of('c8')?.parts.map((p) => p.key)).not.toContain('stumping')
    expect(of('c7')?.points).toBe(2 + 12)
  })
  it('a player who only appeared scores the appearance; one who did not play is absent', () => {
    expect(of('c6')?.points).toBe(2)
    expect(pts.has(playerId('c20'))).toBe(false)
  })
  it('duck only counts for a batter out for 0, not retired or not out', () => {
    const base = { appeared: true, bowl: [], credits: [] }
    const bat = (status: 'out' | 'not_out', dismissal: 'retired' | 'bowled' | null, runs = 0) => [{ m: 1, seq: 1, player: 1, pos: 1, status, runs, balls: 3, fours: 0, sixes: 0, dismissal }]
    expect(scorePlayerGame({ ...base, bat: bat('not_out', null) }, T).points).toBe(2)
    expect(scorePlayerGame({ ...base, bat: bat('out', 'retired') }, T).points).toBe(2)
    expect(scorePlayerGame({ ...base, bat: bat('out', 'bowled') }, T).points).toBe(2 - 3)
    expect(scorePlayerGame({ ...base, bat: bat('out', 'bowled', 1) }, T).points).toBe(3)
  })
  it('no appearance scores nothing even with facts', () => expect(scorePlayerGame({ appeared: false, bat: [], bowl: [], credits: [] }, T)).toEqual({ points: 0, parts: [] }))
  it('uses the season table, not a built-in one', () => {
    const t = { ...T, run: 2, appearance: 0 }
    const again = roundPoints(set, '2025-10-11', t, all(set))
    expect(again.get(playerId('c2'))?.points).toBe(104 + 3 + 2 + 8)
  })
})

describe('rounds of points', () => {
  it('a player who plays twice in a weekend sums both games', () => {
    const set = facts([
      { gameId: 'a', date: '2025-10-11', innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, status: 'out', runs: 10, fours: 0, sixes: 0, dismissal: 'bowled' }] }] },
      { gameId: 'b', date: '2025-10-12', innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, status: 'out', runs: 20, fours: 0, sixes: 0, dismissal: 'bowled' }] }] },
    ])
    const r = roundPoints(set, '2025-10-11', T, all(set)).get(playerId('c1'))!
    expect(r.points).toBe(2 + 10 + 2 + 20)
    expect(r.games).toBe(2)
  })
  it('a game in another weekend is not counted', () => {
    const set = facts([{ date: '2025-10-18', innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 10 }] }] }])
    expect(roundPoints(set, '2025-10-11', T, all(set)).size).toBe(0)
  })
  it('a hidden player (absent from the visible set) never scores', () => {
    const set = assembleFacts([deriveFacts(mkBundle({ date: '2025-10-11', innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 10 }, { who: 'c2', pos: 2, runs: 5 }] }] }), new Set([playerId('c2')]), 1)!])
    expect(roundPoints(set, '2025-10-11', T, new Set([playerId('c1'), playerId('c2')])).has(playerId('c1'))).toBe(false)
  })
  it('a junior outside the eligible set never scores', () => {
    const set = facts([SAT])
    const eligible = new Set([...all(set)].filter((p) => p !== playerId('c3')))
    expect(roundPoints(set, '2025-10-11', T, eligible).has(playerId('c3'))).toBe(false)
  })
  it('an abandoned or forfeited game scores no appearance', () => {
    const innings = [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 10 }] }]
    const set = facts([{ gameId: 'ab', date: '2025-10-11', result: 'abandoned', innings }, { gameId: 'ff', date: '2025-10-11', forfeit: true, innings }])
    expect(roundPoints(set, '2025-10-11', T, all(set)).size).toBe(0)
    expect(scoringMatchIds(set).size).toBe(0)
    expect(isNoResultHeader({ forfeit: false, result: 'won' })).toBe(false)
    expect(isNoResultHeader({ forfeit: false, result: 'abandoned' })).toBe(true)
  })
  it('totals over every match are available for pricing', () => {
    const set = facts([SAT])
    expect(pointsForMatches(set, scoringMatchIds(set), T, all(set)).get(playerId('c2'))?.games).toBe(1)
  })
})

describe('captain and the leaderboard', () => {
  it('the captain multiplies points, a negative too', () => {
    expect(withCaptain(10, true, 2)).toBe(20)
    expect(withCaptain(-3, true, 2)).toBe(-6)
    expect(withCaptain(10, false, 2)).toBe(10)
  })
  const rounds = [
    { key: '2025-10-11', points: new Map([[1, 10], [2, -4], [3, 7]]), provisional: false },
    { key: '2025-10-18', points: new Map([[1, 5], [2, 20]]), provisional: true },
  ]
  const entries = [{ id: 1, teamName: 'A', joinedAt: '2025-10-01' }, { id: 2, teamName: 'B', joinedAt: '2025-10-02' }, { id: 3, teamName: 'C', joinedAt: '2025-10-03' }]
  it('sums the squad in force each round, doubles the captain and keeps a squad when nothing is saved', () => {
    const rows = buildLeaderboard({
      entries, captainMultiplier: 2, rounds,
      squads: [
        { entry: 1, round: '2025-10-11', picks: [1, 2], captain: 2 }, // -4*2 + 10 = 2, then carried: 5 + 40 = 45
        { entry: 2, round: '2025-10-11', picks: [1, 3], captain: 1 }, // 20 + 7 = 27; round 2: 5*2 = 10
        { entry: 2, round: '2025-10-18', picks: [2, 3], captain: 2 }, // 40
      ],
    })
    const a = rows.find((r) => r.teamName === 'A')!
    expect(a.rounds.map((r) => r.points)).toEqual([2, 45])
    expect(a.total).toBe(47)
    const b = rows.find((r) => r.teamName === 'B')!
    expect(b.rounds.map((r) => r.points)).toEqual([27, 40])
    expect(rows.find((r) => r.teamName === 'C')!.total).toBe(0)
    expect(rows.map((r) => r.teamName)).toEqual(['B', 'A', 'C'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
  })
  it('breaks a tie by best round then earlier join', () => {
    const squads = [{ entry: 1, round: '2025-10-11', picks: [1], captain: 1 }, { entry: 2, round: '2025-10-11', picks: [1], captain: 1 }, { entry: 3, round: '2025-10-11', picks: [1], captain: 1 }]
    const rows = buildLeaderboard({ entries, squads, rounds: [rounds[0]], captainMultiplier: 1 })
    expect(rows.map((r) => r.entry)).toEqual([1, 2, 3])
    const split = buildLeaderboard({ entries, squads: [{ entry: 3, round: '2025-10-11', picks: [1], captain: 1 }], rounds: [rounds[0], { key: '2025-10-18', points: new Map([[1, 0]]), provisional: false }], captainMultiplier: 1 })
    expect(split[0].entry).toBe(3)
  })
  it('squadFor takes the latest squad at or before the round', () => {
    const s = [{ entry: 1, round: '2025-10-11', picks: [1], captain: 1 }, { entry: 1, round: '2025-10-25', picks: [2], captain: 2 }]
    expect(squadFor(s, '2025-10-04')).toBeNull()
    expect(squadFor(s, '2025-10-18')?.picks).toEqual([1])
    expect(squadFor(s, '2025-11-01')?.picks).toEqual([2])
  })
})

describe('rules', () => {
  it('fills defaults and clamps out-of-range values', () => {
    const r = resolveRules({ squadSize: 99, salaryCapTenths: 'x', scoring: { run: 3 }, minPriceTenths: 100, maxPriceTenths: 10 })
    expect(r.squadSize).toBe(15)
    expect(r.salaryCapTenths).toBe(1000)
    expect(r.scoring.run).toBe(3)
    expect(r.scoring.wicket).toBe(20)
    expect(r.maxPriceTenths).toBeGreaterThanOrEqual(r.minPriceTenths)
  })
})
