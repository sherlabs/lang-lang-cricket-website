import { describe, expect, it } from 'vitest'
import { matchCountsOf } from '@/lib/stats/match/counts'
import { batterDismissals, bowlerDismissals, fieldingMismatches } from '@/lib/stats/match/dismissals'
import { assembleFacts, deriveFacts, playerFacts } from '@/lib/stats/match/facts'
import { DEFAULT_MATCH_MINIMUMS } from '@/lib/stats/match/minimums'
import { mkBundle, playerId, everyone, type BatSpec } from './match-facts-helpers'

const bat = (n: number, o: Partial<BatSpec>): BatSpec[] => Array.from({ length: n }, (_, i) => ({ who: 'c1', pos: i + 1, runs: 10, status: 'out' as const, dismissal: 'bowled' as const, ...o }))
const countsOf = (spec: Parameters<typeof mkBundle>[0], who = 'c1') =>
  matchCountsOf(playerFacts(assembleFacts([deriveFacts(mkBundle(spec), everyone)!]), playerId(who)))

describe('batter dismissals', () => {
  it('shows caught as one segment and excludes not-recorded rows from the share denominator', () => {
    const rows: BatSpec[] = [
      ...bat(4, { dismissal: 'bowled' }).map((b, i) => ({ ...b, pos: i + 1 })),
      ...bat(3, { dismissal: 'caught' }).map((b, i) => ({ ...b, pos: i + 5 })),
      { who: 'c1', pos: 8, status: 'out', runs: 3, dismissal: 'caught_and_bowled' },
      { who: 'c1', pos: 9, status: 'out', runs: 3, dismissal: 'lbw' },
      { who: 'c1', pos: 10, status: 'out', runs: 3, dismissal: null },
      { who: 'c1', pos: 11, status: 'not_out', runs: 3 },
      { who: 'c1', pos: 12, status: 'not_out', runs: 0, dismissal: 'retired_hurt' },
    ]
    // One innings per row so the same player can have many innings.
    const innings = rows.map((b, i) => ({ seq: i + 1, clubBatting: true, runs: 100, wickets: 3, bat: [b] }))
    const c = countsOf({ type: 'twoDay', innings })
    const d = batterDismissals(c, { rateInnings: 5 })
    expect(d.outs).toBe(10)
    expect(d.recorded).toBe(9)
    expect(d.segments.find((s) => s.key === 'caught')?.count).toBe(3)
    expect(d.segments.find((s) => s.key === 'caught_and_bowled')?.count).toBe(1)
    expect(d.segments.find((s) => s.key === 'not_recorded')?.count).toBe(1)
    expect(d.segments.find((s) => s.key === 'not_out')?.count).toBe(2)
    expect(d.retiredNotOut).toBe(1)
    expect(d.bowledPct).toBeCloseTo((4 / 9) * 100)
    expect(d.caughtPct).toBeCloseTo((4 / 9) * 100)
    expect(d.lbwPct).toBeCloseTo((1 / 9) * 100)
  })

  it('shows no share below the minimum number of dismissals', () => {
    const c = countsOf({ innings: [{ seq: 1, clubBatting: true, runs: 10, wickets: 1, bat: bat(1, { dismissal: 'bowled' }) }] })
    expect(batterDismissals(c, DEFAULT_MATCH_MINIMUMS).bowledPct).toBeNull()
  })
})

describe('bowler dismissals', () => {
  it('sums by type and reports reconciled versus wicket-taking innings', () => {
    const inn = (seq: number, wickets: number) => ({
      seq, clubBatting: false, runs: 100, wickets, bowl: [{ who: 'c1', wickets }],
      bat: [{ who: 'o1', pos: 1, dismissal: 'bowled' as const, bowler: 'c1' }, { who: 'o2', pos: 2, dismissal: 'stumped' as const, bowler: 'c1' }],
    })
    const d = bowlerDismissals(countsOf({ type: 'twoDay', innings: [inn(1, 2), inn(2, 3)] }))
    expect(d.total).toBe(2)
    expect(d).toMatchObject({ reconciled: 1, wicketTakingInnings: 2 })
    expect(d.segments.map((s) => s.key)).toEqual(['bowled', 'stumped'])
  })
})

describe('fieldingMismatches (run-outs and stumpings versus events)', () => {
  const b = (o: { runOutRow?: number; stumpRow?: number; events?: BatSpec[]; hasBowling?: boolean }) =>
    mkBundle({ innings: [{ seq: 1, clubBatting: false, hasBowling: o.hasBowling ?? true, runs: 50, wickets: 2, bat: o.events ?? [], field: o.runOutRow !== undefined || o.stumpRow !== undefined ? [{ who: 'c1', roUnassisted: o.runOutRow ?? 0, stumpings: o.stumpRow ?? 0 }] : [] }] })
  const ev = (type: 'run_out' | 'stumped'): BatSpec => ({ who: 'o1', pos: 1, dismissal: type, fielder: 'c1', bowler: 'c2' })

  it('is silent when events and fielding rows agree', () => {
    expect(fieldingMismatches(b({ runOutRow: 1, events: [ev('run_out')] }))).toEqual([])
    expect(fieldingMismatches(b({ stumpRow: 1, events: [ev('stumped')] }))).toEqual([])
  })
  it('logs a first-fielder run-out credit above the row and a stumping disagreement, in either direction', () => {
    expect(fieldingMismatches(b({ runOutRow: 0, events: [ev('run_out')] })).join()).toMatch(/fielding_mismatch:run_out/)
    expect(fieldingMismatches(b({ stumpRow: 0, events: [ev('stumped')] })).join()).toMatch(/fielding_mismatch:stumped/)
    expect(fieldingMismatches(b({ stumpRow: 2, events: [] })).join()).toMatch(/fielding_mismatch:stumpings/)
  })
  it('does not check an innings with no bowling data', () => {
    expect(fieldingMismatches(b({ hasBowling: false, events: [ev('run_out')] }))).toEqual([])
  })
})
