import { describe, expect, it } from 'vitest'
import { assembleFacts, deriveFacts } from '@/lib/stats/match/facts'
import { bestByWicket, derivePartnerships, partnershipsForPlayer, topPartnerships, unavailableText, type PartnershipRow } from '@/lib/stats/match/partnerships'
import { mkBundle, type BatSpec, playerId, visible } from './match-facts-helpers'

const row = (pos: number, status: PartnershipRow['status'], fow?: [number, number], extra: Partial<PartnershipRow> = {}): PartnershipRow => ({
  player: 100 + pos, position: pos, status, dismissal: status === 'out' ? 'bowled' : null, fowWicket: fow?.[0] ?? null, fowRuns: fow?.[1] ?? null, ...extra,
})

// Ten wickets, runs 20, 45, 60, 100, 100, 130, 150, 160, 170, 175
const FULL: PartnershipRow[] = [
  row(1, 'out', [1, 20]), row(2, 'out', [2, 45]), row(3, 'out', [3, 60]), row(4, 'out', [4, 100]), row(5, 'out', [5, 100]),
  row(6, 'out', [6, 130]), row(7, 'out', [7, 150]), row(8, 'out', [8, 160]), row(9, 'out', [9, 170]), row(10, 'out', [10, 175]), row(11, 'not_out'),
]

describe('derivePartnerships', () => {
  it('derives a clean ten wicket innings from batting order and fall of wickets', () => {
    const r = derivePartnerships({ hasFow: true, allOut: true, totalRuns: 180, totalWickets: 10, rows: FULL })
    expect(r.unavailable).toBeNull()
    expect(r.pairs.map((p) => p.runs)).toEqual([20, 25, 15, 40, 0, 30, 20, 10, 10, 5])
    expect(r.pairs[0]).toMatchObject({ wicket: 1, a: 101, b: 102, unbroken: false })
    expect(r.pairs[2]).toMatchObject({ wicket: 3 })
    expect(r.pairs.every((p) => !p.unbroken)).toBe(true)
  })

  it('pairs the dismissed batter with the batter still at the crease', () => {
    const r = derivePartnerships({ hasFow: true, allOut: true, totalRuns: 180, totalWickets: 10, rows: FULL })
    // 1 and 2 open; 1 out (w1) -> 3 in; 2 out (w2) partner 3 -> 4 in; 3 out (w3) partner 4.
    expect(r.pairs.slice(0, 4).map((p) => [p.a, p.b])).toEqual([[101, 102], [102, 103], [103, 104], [104, 105]])
  })

  it('marks an unbroken last stand when the innings was declared with two not-out batters', () => {
    const rows = [row(1, 'out', [1, 30]), row(2, 'out', [2, 70]), row(3, 'not_out'), row(4, 'not_out'), row(5, 'did_not_bat' as never)].filter((r) => r.status !== ('did_not_bat' as never))
    const r = derivePartnerships({ hasFow: true, allOut: false, totalRuns: 150, totalWickets: 2, rows })
    expect(r.unavailable).toBeNull()
    expect(r.pairs).toHaveLength(3)
    expect(r.pairs[2]).toMatchObject({ wicket: 3, runs: 80, unbroken: true, a: 103, b: 104 })
  })

  it('has no unbroken pair when the innings was all out, even with fewer than ten wickets (nine-wicket all out)', () => {
    const rows = [
      row(1, 'out', [1, 10]), row(2, 'out', [2, 20]), row(3, 'out', [3, 30]), row(4, 'out', [4, 40]), row(5, 'out', [5, 50]),
      row(6, 'out', [6, 60]), row(7, 'out', [7, 70]), row(8, 'out', [8, 80]), row(9, 'out', [9, 90]), row(10, 'not_out'),
    ]
    const r = derivePartnerships({ hasFow: true, allOut: true, totalRuns: 95, totalWickets: 9, rows })
    expect(r.unavailable).toBeNull()
    expect(r.pairs).toHaveLength(9)
    expect(r.pairs.at(-1)).toMatchObject({ wicket: 9, unbroken: false })
  })

  it('skips the unbroken stand when the total is unknown', () => {
    const rows = [row(1, 'out', [1, 30]), row(2, 'not_out'), row(3, 'not_out')]
    const r = derivePartnerships({ hasFow: true, allOut: false, totalRuns: null, totalWickets: 1, rows })
    expect(r.pairs).toHaveLength(1)
  })

  it.each([
    ['no_fow', { hasFow: false, rows: FULL }],
    ['retirement', { hasFow: true, rows: [row(1, 'out', [1, 10]), row(2, 'not_out', undefined, { dismissal: 'retired_hurt' }), row(3, 'not_out')] }],
    ['bad_position', { hasFow: true, rows: [row(1, 'out', [1, 10]), row(0, 'not_out'), row(3, 'not_out')] }],
    ['fow_gap', { hasFow: true, rows: [row(1, 'out', [1, 10]), row(2, 'out', [3, 20]), row(3, 'not_out'), row(4, 'not_out')] }],
    ['fow_missing_for_out', { hasFow: true, rows: [row(1, 'out', [1, 10]), row(2, 'out'), row(3, 'not_out'), row(4, 'not_out')] }],
    ['fow_runs_decrease', { hasFow: true, rows: [row(1, 'out', [1, 50]), row(2, 'out', [2, 20]), row(3, 'not_out'), row(4, 'not_out')] }],
    ['crease_mismatch', { hasFow: true, rows: [row(1, 'out', [1, 10]), row(2, 'not_out'), row(3, 'out', [2, 20]), row(4, 'not_out')].map((r, i) => (i === 2 ? { ...r, position: 5 } : r)) }],
    ['total_mismatch', { hasFow: true, totalWickets: 5, rows: [row(1, 'out', [1, 10]), row(2, 'not_out'), row(3, 'not_out')] }],
  ] as const)('rejects an innings with reason %s', (reason, o) => {
    const r = derivePartnerships({ hasFow: o.hasFow, allOut: false, totalRuns: 100, totalWickets: 'totalWickets' in o ? o.totalWickets : o.rows.filter((x) => x.status === 'out').length, rows: o.rows as PartnershipRow[] })
    expect(r.unavailable).toBe(reason)
    expect(r.pairs).toEqual([])
  })

  it('describes the rejection counts in the caption text', () => {
    expect(unavailableText({ retirement: 2, fow_gap: 1 }, 20)).toBe('3 of 20 innings unavailable (2 retirement, 1 missing fall of wicket number)')
    expect(unavailableText({}, 20)).toBeNull()
  })
})

describe('partnerships through deriveFacts (hidden partners)', () => {
  const bat = (who: string, pos: number, status: 'out' | 'not_out', fow?: [number, number]): BatSpec => ({ who, pos, status, runs: 10, dismissal: status === 'out' ? 'bowled' : null, bowler: 'o1', fow })
  const bundle = mkBundle({
    innings: [{
      seq: 1, clubBatting: true, hasFow: true, runs: 120, wickets: 2, allOut: false,
      bat: [bat('c1', 1, 'out', [1, 40]), bat('c2', 2, 'out', [2, 80]), bat('c3', 3, 'not_out'), bat('c4', 4, 'not_out')],
    }],
  })

  it('keeps a pair with a hidden partner as null, and omits it from public lists', () => {
    const f = deriveFacts(bundle, visible('c1', 'c3', 'c4'))!
    expect(f.partnerships.map((p) => [p.a, p.b])).toEqual([[101, null], [null, 103], [103, 104]])
    const set = assembleFacts([f])
    const forC1 = partnershipsForPlayer(set.partnerships, playerId('c1'))
    expect(forC1.withVisible).toEqual([])
    expect(forC1.others).toEqual({ count: 1, best: 40 })
    expect(bestByWicket(set.partnerships).size).toBe(1)
    expect([...bestByWicket(set.partnerships).values()][0]).toMatchObject({ wicket: 3, unbroken: true, runs: 40 })
    expect(topPartnerships(set.partnerships, 25)).toHaveLength(1)
  })

  it('lists a pair with a visible partner on both profiles', () => {
    const set = assembleFacts([deriveFacts(bundle, visible('c1', 'c2', 'c3', 'c4'))!])
    expect(partnershipsForPlayer(set.partnerships, playerId('c2')).withVisible.map((p) => p.partner).sort()).toEqual([101, 103])
    expect(partnershipsForPlayer(set.partnerships, playerId('c3')).byPartner.map((x) => x.partner)).toEqual([102, 104])
  })

  it('records why an innings is unavailable, and an innings with no fall of wickets yields no pairs', () => {
    const b = mkBundle({ innings: [{ seq: 1, clubBatting: true, hasFow: false, runs: 50, wickets: 1, bat: [bat('c1', 1, 'out'), bat('c2', 2, 'not_out')] }] })
    const f = deriveFacts(b, visible('c1', 'c2'))!
    expect(f.partnerships).toEqual([])
    expect(f.innings[0].partnerships).toBe('no_fow')
  })
})

describe('bestByWicket and topPartnerships', () => {
  const p = (m: number, wicket: number, runs: number, a: number | null = 101, b: number | null = 102) => ({ m, seq: 1, wicket, runs, a, b, unbroken: false })
  it('keeps the highest public pair per wicket and ranks ties together', () => {
    const all = [p(1, 1, 50), p(2, 1, 80), p(3, 2, 80), p(4, 2, 200, null)]
    expect(bestByWicket(all).get(1)!.runs).toBe(80)
    expect(bestByWicket(all).get(2)!.runs).toBe(80)
    const top = topPartnerships(all, 25)
    expect(top.map((t) => [t.rank, t.p.runs])).toEqual([[1, 80], [1, 80], [3, 50]])
  })
})
