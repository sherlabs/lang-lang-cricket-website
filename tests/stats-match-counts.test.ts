import { describe, expect, it } from 'vitest'
import { matchCountsOf, countsByPlayer } from '@/lib/stats/match/counts'
import { assembleFacts, deriveFacts, playerFacts } from '@/lib/stats/match/facts'
import { mkBundle, playerId, visible, everyone, type BatSpec, type BundleSpec, type InningsSpec } from './match-facts-helpers'

const countsFor = (spec: BundleSpec | BundleSpec[], who = 'c1', ids = everyone) => {
  const specs = Array.isArray(spec) ? spec : [spec]
  const set = assembleFacts(specs.map((s, i) => deriveFacts(mkBundle({ id: i + 1, gameId: `g${i + 1}`, ...s }), ids)!))
  return matchCountsOf(playerFacts(set, playerId(who)))
}
const batInnings = (bat: BatSpec[], extra: Partial<InningsSpec> = {}): InningsSpec => ({ seq: 1, clubBatting: true, runs: 100, wickets: 3, bat, ...extra })
const one = (b: BatSpec, extra: Partial<InningsSpec> = {}) => countsFor({ innings: [batInnings([b], extra)] })

describe('batting milestones (spec 2.2)', () => {
  it.each([[49, 0, 0], [50, 1, 0], [99, 1, 0], [100, 0, 1], [131, 0, 1]])('a score of %i is %i fifty and %i hundred', (runs, f, h) => {
    const c = one({ who: 'c1', pos: 1, runs, status: 'out', dismissal: 'bowled' })
    expect([c.fifties, c.hundreds]).toEqual([f, h])
  })
  it('counts a not-out fifty', () => expect(one({ who: 'c1', pos: 1, runs: 62, status: 'not_out' }).fifties).toBe(1))

  it('a duck is out for nought; 0 not out and retired hurt on 0 are not ducks', () => {
    expect(one({ who: 'c1', pos: 1, runs: 0, status: 'out', dismissal: 'bowled' }).ducks).toBe(1)
    expect(one({ who: 'c1', pos: 1, runs: 0, status: 'not_out' }).ducks).toBe(0)
    expect(one({ who: 'c1', pos: 1, runs: 0, status: 'not_out', dismissal: 'retired_hurt' }).ducks).toBe(0)
    expect(one({ who: 'c1', pos: 1, runs: 0, status: 'out', dismissal: 'retired_out' }).ducks).toBe(0)
    expect(one({ who: 'c1', pos: 1, runs: 0, status: 'unknown' }).ducks).toBe(0)
  })

  it('a golden duck needs a recorded ball; a duck with null balls is not decidable', () => {
    const c = countsFor({ innings: [batInnings([
      { who: 'c1', pos: 1, runs: 0, status: 'out', dismissal: 'bowled', balls: 1 },
    ]), batInnings([{ who: 'c1', pos: 1, runs: 0, status: 'out', dismissal: 'lbw', balls: null, fours: null, sixes: null }], { seq: 2 }),
    batInnings([{ who: 'c1', pos: 1, runs: 0, status: 'out', dismissal: 'lbw', balls: 4 }], { seq: 3 })] })
    expect(c).toMatchObject({ ducks: 3, ducksWithBalls: 2, goldenDucks: 1 })
  })

  it('decides ball based figures per row, never from the innings flag', () => {
    const c = countsFor({ innings: [batInnings([
      { who: 'c1', pos: 1, runs: 40, status: 'out', dismissal: 'bowled', balls: 30, fours: 4, sixes: 1 },
      { who: 'c2', pos: 2, runs: 20, status: 'out', dismissal: 'bowled', balls: null, fours: null, sixes: null },
    ], { hasBall: true })] }, 'c2')
    expect(c).toMatchObject({ runs: 20, ballInnings: 0, ballsFaced: 0, boundaryInnings: 0 })
    const c1 = countsFor({ innings: [batInnings([{ who: 'c1', pos: 1, runs: 40, balls: 30, fours: 4, sixes: 1 }])] })
    expect(c1).toMatchObject({ ballInnings: 1, ballsFaced: 30, runsOnBalls: 40, boundaryInnings: 1, boundaries: 5, boundaryBalls: 30 })
  })

  it('does not count did-not-bat, and an unknown row is neither out nor not out', () => {
    const c = countsFor({ innings: [batInnings([{ who: 'c1', pos: 1, runs: 5, status: 'unknown' }, { who: 'c2', pos: 2, status: 'did_not_bat' }])] })
    expect(c).toMatchObject({ battingInnings: 1, outs: 0, notOuts: 0 })
    expect(countsFor({ innings: [batInnings([{ who: 'c2', pos: 2, status: 'did_not_bat' }])] }, 'c2').battingInnings).toBe(0)
  })

  it('ignores an unplayed placeholder innings and a forfeit contributes nothing', () => {
    const placeholder = { seq: 3, clubBatting: true, played: false, bat: [{ who: 'c1', pos: 1, status: 'not_out' as const, runs: 0 }] }
    expect(countsFor({ innings: [placeholder] }).battingInnings).toBe(0)
    const forfeit = countsFor({ forfeit: true, result: 'won', extra: ['c1'], innings: [] })
    expect(forfeit).toMatchObject({ games: 1, wins: 0, resultGames: 0, battingInnings: 0 })
  })
})

describe('bowling milestones', () => {
  const bowl = (wickets: number, seq = 1, extra: Partial<InningsSpec> = {}): InningsSpec => ({ seq, clubBatting: false, runs: 150, wickets: 10, bowl: [{ who: 'c1', wickets }], ...extra })
  it('counts five-fors and three-fors from innings with bowling data only', () => {
    const c = countsFor({ innings: [bowl(5), bowl(3, 2), bowl(2, 3)] })
    expect(c).toMatchObject({ fiveFors: 1, threeFors: 2, bowlingInnings: 3, wickets: 10 })
  })
  it('counts ten wickets in a two-day match, but only when every innings the side bowled has figures', () => {
    const complete = countsFor({ type: 'twoDay', innings: [bowl(6, 2), bowl(4, 4)] })
    expect(complete).toMatchObject({ tenWicketMatches: 1, tenWicketUndecided: 0 })
    const missing = countsFor({ type: 'twoDay', innings: [bowl(6, 2), { seq: 4, clubBatting: false, runs: 100, wickets: 10, hasBowling: false, bowl: [{ who: 'c1', wickets: 4 }] }] })
    expect(missing).toMatchObject({ tenWicketMatches: 0, tenWicketUndecided: 1 })
    expect(countsFor({ type: 'twoDay', innings: [bowl(5, 2), bowl(4, 4)] }).tenWicketMatches).toBe(0)
  })
})

describe('results (spec 2.7)', () => {
  it('counts wins from non-forfeit games and excludes forfeits from the win percentage denominator', () => {
    const base = { extra: ['c1'], innings: [] }
    const c = countsFor([
      { ...base, result: 'won' }, { ...base, result: 'lost' }, { ...base, result: 'draw' }, { ...base, result: 'tie' }, { ...base, result: 'no_result' },
      { ...base, result: 'won', forfeit: true }, { ...base, result: 'lost', forfeit: true },
    ])
    expect(c).toMatchObject({ games: 7, wins: 1, resultGames: 4 })
  })
})

describe('fielding credits (spec 2.3)', () => {
  const dismiss = (type: BatSpec['dismissal'], o: Partial<BatSpec> = {}): BatSpec => ({ who: 'o1', pos: 1, status: 'out', runs: 5, dismissal: type, bowler: 'c2', ...o })
  it('credits catches, caught and bowled, and takes run-outs and stumpings from the fielding rows with n/a where none', () => {
    const inn: InningsSpec = {
      seq: 1, clubBatting: false, runs: 100, wickets: 3, bowl: [{ who: 'c2', wickets: 2 }],
      bat: [dismiss('caught', { fielder: 'c1' }), dismiss('caught_and_bowled', { who: 'o2', pos: 2 }), dismiss('run_out', { who: 'o3', pos: 3, bowler: undefined, fielder: 'c1' })],
      field: [{ who: 'c1', roUnassisted: 1, roAssisted: 1, stumpings: 0 }],
    }
    const c1 = countsFor({ innings: [inn] }, 'c1')
    expect(c1).toMatchObject({ catches: 1, runOuts: 2, stumpings: 0, fieldingInnings: 1 })
    const c2 = countsFor({ innings: [inn] }, 'c2')
    expect(c2).toMatchObject({ catches: 1, runOuts: 0, fieldingInnings: 0 })
  })
  it('credits no catch for a not-out row or a hidden fielder', () => {
    const inn: InningsSpec = { seq: 1, clubBatting: false, runs: 10, wickets: 1, bat: [dismiss('caught', { fielder: 'c1', status: 'not_out' })] }
    expect(countsFor({ innings: [inn] }, 'c1').catches).toBe(0)
    const hidden = countsFor({ innings: [{ ...inn, bat: [dismiss('caught', { fielder: 'c1' })] }] }, 'c1', visible('c2'))
    expect(hidden.games).toBe(0)
  })
})

describe('wickets by type (spec 2.3, bowler chart)', () => {
  it('uses only innings whose credited dismissals reconcile with the scorecard', () => {
    const ok: InningsSpec = {
      seq: 1, clubBatting: false, runs: 100, wickets: 2, bowl: [{ who: 'c1', wickets: 2 }],
      bat: [{ who: 'o1', pos: 1, dismissal: 'bowled', bowler: 'c1' }, { who: 'o2', pos: 2, dismissal: 'lbw', bowler: 'c1' }],
    }
    const bad: InningsSpec = { ...ok, seq: 2, bowl: [{ who: 'c1', wickets: 3 }] }
    const c = countsFor({ type: 'twoDay', innings: [ok, bad] })
    expect(c).toMatchObject({ wicketTakingInnings: 2, reconciledWicketInnings: 1 })
    expect(c.wicketsByType).toMatchObject({ bowled: 1, lbw: 1, caught: 0 })
  })
  it('never credits run outs to a bowler', () => {
    const inn: InningsSpec = {
      seq: 1, clubBatting: false, runs: 100, wickets: 1, bowl: [{ who: 'c1', wickets: 0 }],
      bat: [{ who: 'o1', pos: 1, dismissal: 'run_out', bowler: 'c1', fielder: 'c2' }],
    }
    const c = countsFor({ innings: [inn] })
    expect(c.reconciledWicketInnings + c.wicketTakingInnings).toBe(0)
    expect(Object.values(c.wicketsByType).reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('countsByPlayer', () => {
  it('splits one set into per-player counts', () => {
    const set = assembleFacts([deriveFacts(mkBundle({ innings: [batInnings([{ who: 'c1', pos: 1, runs: 60 }, { who: 'c2', pos: 2, runs: 10 }])] }), everyone)!])
    const by = countsByPlayer(set)
    expect(by.get(101)!.fifties).toBe(1)
    expect(by.get(102)!.runs).toBe(10)
  })
})
