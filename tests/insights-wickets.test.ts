import { describe, expect, it } from 'vitest'
import { INSIGHTS } from '../config/site'
import { collapseSummary, findCollapses, fowInnings, formatGroup, scoreAtWicket, sideTable, type FowInnings } from '../lib/insights/wickets'
import { decodeFacts, encodeFacts } from '../lib/stats/match/codec'
import { deriveFow } from '../lib/stats/match/fow'
import { assembleFacts, deriveFacts } from '../lib/stats/match/facts'
import { STATLAB_MAX_SEASONS } from '../lib/stats/match/limits'
import type { FactSet, InningsMeta, MatchHeader } from '../lib/stats/match/types'
import { everyone, mkBundle } from './match-facts-helpers'

const entries = (runs: number[]) => runs.map((r, i) => ({ fowWicket: i + 1, fowRuns: r }))

describe('deriveFow', () => {
  const ok = (runs: number[], extra = {}) => deriveFow({ hasFow: true, totalRuns: 200, totalWickets: runs.length, entries: entries(runs), ...extra })
  it('returns the score at each wicket in wicket order whatever the input order', () => {
    expect(ok([10, 20, 20, 55]).fow).toEqual([10, 20, 20, 55])
    const shuffled = deriveFow({ hasFow: true, totalRuns: 200, totalWickets: 3, entries: [entries([5, 9, 30])[2], entries([5, 9, 30])[0], entries([5, 9, 30])[1]] })
    expect(shuffled.fow).toEqual([5, 9, 30])
  })
  it('says nothing for an innings with no fall of wickets (absent, not rejected)', () => {
    expect(deriveFow({ hasFow: false, totalRuns: 100, totalWickets: 4, entries: [] })).toEqual({ fow: null, reject: null })
  })
  it('rejects a gap, a decrease, a count that disagrees with the wickets and a score above the total', () => {
    expect(deriveFow({ hasFow: true, totalRuns: 90, totalWickets: 3, entries: [{ fowWicket: 1, fowRuns: 5 }, { fowWicket: 3, fowRuns: 9 }, { fowWicket: 4, fowRuns: 12 }] }).reject).toBe('fow_gap')
    expect(ok([10, 8, 30]).reject).toBe('fow_runs_decrease')
    expect(ok([10, 20, 30], { totalWickets: 4 }).reject).toBe('total_mismatch')
    expect(ok([10, 20, 300]).reject).toBe('total_mismatch')
    expect(deriveFow({ hasFow: true, totalRuns: 90, totalWickets: 2, entries: [{ fowWicket: 1, fowRuns: 5 }, { fowWicket: 2, fowRuns: null }] }).reject).toBe('fow_runs_decrease')
    expect(deriveFow({ hasFow: true, totalRuns: 90, totalWickets: 2, entries: [{ fowWicket: 1, fowRuns: 5 }, { fowWicket: 1, fowRuns: 6 }] }).reject).toBe('fow_gap')
  })
  it('accepts an unknown team total (imported games) when the rest validates', () => {
    expect(ok([10, 20], { totalRuns: null }).fow).toEqual([10, 20])
  })
})

describe('findCollapses', () => {
  // Defaults used here: 4 wickets for at most 20 runs.
  const find = (fow: number[]) => findCollapses(fow, 4, 20)
  it('counts exactly 4 wickets for exactly 20 runs, and not 21', () => {
    expect(find([50, 55, 60, 65, 70])).toEqual([{ from: 2, to: 5, startScore: 50, endScore: 70, wickets: 4, runs: 20 }])
    expect(find([50, 55, 60, 65, 71])).toEqual([])
    expect(find([50, 80, 110, 140])).toEqual([])
  })
  it('a collapse from the first wicket measures from zero', () => {
    expect(find([5, 10, 15, 20])).toEqual([{ from: 1, to: 4, startScore: 0, endScore: 20, wickets: 4, runs: 20 }])
    expect(find([5, 10, 15, 21])).toEqual([])
  })
  it('three wickets are never a collapse and an unbroken innings has none', () => {
    expect(find([1, 2, 3])).toEqual([])
    expect(find([])).toEqual([])
    expect(find([60, 120, 180, 240])).toEqual([])
  })
  it('overlapping windows are one collapse, reported as the whole span', () => {
    expect(find([30, 32, 34, 36, 40, 90])).toEqual([{ from: 2, to: 5, startScore: 30, endScore: 40, wickets: 4, runs: 10 }])
    expect(find([30, 32, 34, 36, 38, 40, 90])).toEqual([{ from: 2, to: 6, startScore: 30, endScore: 40, wickets: 5, runs: 10 }])
  })
  it('two separate collapses are two', () => {
    expect(find([10, 12, 14, 16, 90, 100, 104, 108, 110, 150]).map((c) => [c.from, c.to])).toEqual([[1, 4], [6, 9]])
  })
  it('thresholds come from the arguments', () => {
    expect(findCollapses([10, 15, 20], 3, 20)).toHaveLength(1)
    expect(findCollapses([10, 15, 40], 3, 20)).toHaveLength(0)
    expect(findCollapses([10, 15, 20], 0, 20)).toEqual([])
  })
})

describe('scoreAtWicket', () => {
  const item = (fow: number[], m = 1): FowInnings => ({ m, seq: 1, side: 'ours', fow, header: { id: m } as MatchHeader, group: 'limited' })
  it('averages per wicket with the count behind it and ignores innings that did not lose that wicket', () => {
    const cells = scoreAtWicket([item([10, 40, 90]), item([20, 50], 2), item([30], 3)], 2)
    expect(cells[0]).toMatchObject({ wicket: 1, n: 3, mean: 20, min: 10, max: 30 })
    expect(cells[1]).toMatchObject({ n: 2, mean: 45, min: 40, max: 50 })
    expect(cells[2]).toMatchObject({ n: 1, mean: null, min: null, max: null })
    expect(cells[9]).toMatchObject({ n: 0, mean: null })
  })
  it('a wicket nobody lost is n/a, never zero', () => {
    expect(scoreAtWicket([], 3).every((c) => c.mean === null && c.n === 0)).toBe(true)
  })
})

describe('sideTable: formats are never averaged together', () => {
  const mk = (m: number, format: string, side: 'ours' | 'theirs', fow: number[]): FowInnings => ({ m, seq: 1, side, fow, header: { id: m, format } as MatchHeader, group: formatGroup({ format }) })
  it('keeps limited-overs and two-day apart and leaves out too few two-day games', () => {
    const list = [mk(1, 'oneDay', 'ours', [10, 20]), mk(2, 'oneDay', 'ours', [30, 60]), mk(3, 'twoDay', 'ours', [100, 200]), mk(4, 'oneDay', 'theirs', [5, 9]), mk(5, '', 'ours', [1])]
    const t = sideTable(list, 'ours', { minInnings: 2, minTimedGames: 3 })
    expect(t.blocks.map((b) => b.group)).toEqual(['limited'])
    expect(t.blocks[0].cells[0].mean).toBe(20)
    expect(t.timedLeftOut).toBe(1)
    expect(t.unknownFormat).toBe(1)
  })
  it('gives two-day games their own block from the minimum', () => {
    const list = [1, 2, 3].map((m) => mk(m, 'twoDay', 'theirs', [100 * m, 200 * m]))
    const t = sideTable(list, 'theirs', { minInnings: 2, minTimedGames: 3 })
    expect(t.blocks.map((b) => [b.group, b.games, b.cells[0].mean])).toEqual([['timed', 3, 200]])
    expect(t.timedLeftOut).toBe(0)
  })
})

function factsFrom(specs: Parameters<typeof mkBundle>[0][]): FactSet {
  return assembleFacts(specs.flatMap((s, i) => { const f = deriveFacts(mkBundle({ id: i + 1, gameId: `g${i + 1}`, ...s }), everyone, i + 1); return f ? [f] : [] }))
}
const bat = (fowRuns: number[], status = 'out' as const) => fowRuns.map((r, i) => ({ who: `c${i + 1}`, pos: i + 1, status, fow: [i + 1, r] as [number, number] }))

describe('facts: fow on the innings and the codec', () => {
  const set = factsFrom([
    { type: 'oneDay', innings: [
      { seq: 1, clubBatting: true, hasFow: true, runs: 80, wickets: 4, bat: bat([10, 20, 30, 40]) },
      { seq: 2, clubBatting: false, hasFow: true, runs: 60, wickets: 3, bat: [{ who: 'o1', pos: 1, fow: [1, 5] }, { who: 'o2', pos: 2, fow: [3, 25] }, { who: 'o3', pos: 3, fow: [2, 20] }] },
    ] },
    { type: 'twoDay', innings: [
      { seq: 1, clubBatting: true, hasFow: true, runs: 80, wickets: 4, bat: [...bat([10, 20, 30]), { who: 'c4', pos: 4, fow: [5, 40] }] },
      { seq: 2, clubBatting: false, hasFow: false, runs: 60, wickets: 3, bat: [] },
    ] },
  ])
  it('derives fow for both sides, rejects a gap and leaves a missing one empty', () => {
    const inn = (m: number, seq: number) => set.innings.get(`${m}:${seq}`) as InningsMeta
    expect(inn(1, 1)).toMatchObject({ fow: [10, 20, 30, 40], fowReject: null })
    expect(inn(1, 2)).toMatchObject({ fow: [5, 20, 25], fowReject: null })
    expect(inn(2, 1)).toMatchObject({ fow: null, fowReject: 'fow_gap' })
    expect(inn(2, 2)).toMatchObject({ fow: null, fowReject: null })
  })
  it('round trips through the cache codec, including valid, rejected and absent', () => {
    const back = decodeFacts(JSON.parse(JSON.stringify(encodeFacts(set))))
    expect([...back.innings.values()]).toEqual([...set.innings.values()])
  })
  it('fowInnings counts valid, rejected and absent separately', () => {
    const { list, coverage } = fowInnings(set)
    expect(list.map((x) => [x.m, x.side, x.group])).toEqual([[1, 'ours', 'limited'], [1, 'theirs', 'limited']])
    expect(coverage).toMatchObject({ innings: 4, valid: 2, noFow: 1, rejectedTotal: 1, rejected: { fow_gap: 1 } })
  })
})

describe('collapseSummary', () => {
  const header = (id: number, date: string, season: string): MatchHeader => ({ id, gameId: `g${id}`, date, seasonName: season, seasonStartYear: Number(season.slice(0, 4)), grade: 'A', team: 'A', format: 'oneDay', result: 'won', forfeit: false, firstInnings: false, oppKey: 'k', oppLabel: 'Rivals' })
  const x = (m: number, side: 'ours' | 'theirs', fow: number[], date: string, season = '2025/26'): FowInnings => ({ m, seq: 1, side, fow, header: header(m, date, season), group: 'limited' })
  const meta = (m: number, partnerships: InningsMeta['partnerships']): InningsMeta => ({ m, seq: 1, clubBatting: true, declared: false, allOut: true, runs: 150, wickets: 10, hasFow: true, hasBowling: true, hasBall: true, fow: null, fowReject: null, partnerships })
  it('lists newest first, counts innings per season and side, and finds the stand after the collapse', () => {
    const list = [x(1, 'ours', [10, 12, 14, 16, 80, 150], '2025-10-01'), x(2, 'theirs', [10, 12, 14, 16, 30], '2025-11-01'), x(3, 'ours', [50, 100, 150], '2025-12-01'), x(4, 'ours', [10, 11, 12, 13], '2024-10-01', '2024/25')]
    const stands = [{ m: 1, seq: 1, wicket: 5, runs: 64, a: 1, b: null, unbroken: false }, { m: 1, seq: 1, wicket: 6, runs: 70, a: 1, b: 2, unbroken: false }, { m: 1, seq: 1, wicket: 3, runs: 99, a: 1, b: 2, unbroken: false }]
    const innings = new Map([['1:1', meta(1, 'ok')], ['4:1', meta(4, 'no_fow')]])
    const s = collapseSummary(list, stands, innings, { wickets: 4, runs: 20 })
    expect(s.entries.map((e) => [e.header.id, e.side, e.collapse.from, e.collapse.to, e.recovery])).toEqual([[2, 'theirs', 1, 5, null], [1, 'ours', 1, 4, 70], [4, 'ours', 1, 4, null]])
    expect(s.perSeason).toEqual([{ season: '2025/26', startYear: 2025, ours: 1, theirs: 1, innings: 3 }, { season: '2024/25', startYear: 2024, ours: 1, theirs: 0, innings: 1 }])
  })
})

describe('blob size', () => {
  it('ten scores per innings stay far below the 2 MB cache entry limit, even at the season cap', () => {
    const innings = Array.from({ length: 700 }, (_, i) => Array.from({ length: 10 }, (__, k) => 20 * (k + 1) + (i % 7)))
    const bytes = JSON.stringify(innings).length
    expect(bytes).toBeLessThan(60_000)
    // The cache holds one entry per season, so the season cap multiplies the total but never one entry.
    expect(STATLAB_MAX_SEASONS).toBeGreaterThan(0)
  })
  it('the config thresholds are the documented defaults', () => {
    expect(INSIGHTS.fow).toMatchObject({ collapseWickets: 4, collapseRuns: 20 })
  })
})
