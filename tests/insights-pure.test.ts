import { describe, expect, it } from 'vitest'
import { INSIGHTS } from '../config/site'
import { buildTrend } from '../lib/insights/chart'
import { byDate, gameViews } from '../lib/insights/games'
import { bucketLabels, bucketize, marginOf, marginSummary } from '../lib/insights/margin'
import { median } from '../lib/insights/num'
import { battingPoints, bowlingPoints, compareSeasons, seasonLines, type SeasonLine } from '../lib/insights/player-trends'
import { rollingBattingAverage, rollingEconomy } from '../lib/insights/rolling'
import { parScores, teamProfile } from '../lib/insights/team-profile'
import { lastResults, rollingFirstInnings, seasonAverages } from '../lib/insights/team-trends'
import { assembleFacts, deriveFacts } from '../lib/stats/match/facts'
import type { FactSet } from '../lib/stats/match/types'
import { everyone, mkBundle, type BundleSpec } from './match-facts-helpers'

const facts = (specs: BundleSpec[]): FactSet => assembleFacts(specs.flatMap((s, i) => { const f = deriveFacts(mkBundle({ id: i + 1, gameId: `g${i + 1}`, ...s }), everyone); return f ? [f] : [] }))

/** A one-innings-each game: club bats first with `ours`, or second. */
const game = (o: { ours: number; theirs: number; first: boolean; result: BundleSpec['result']; wicketsUs?: number; wicketsThem?: number; date?: string; season?: number; grade?: string; allOutUs?: boolean; allOutThem?: boolean; forfeit?: boolean }): BundleSpec => ({
  result: o.result, date: o.date, season: o.season, grade: o.grade, forfeit: o.forfeit,
  innings: o.forfeit ? [] : [
    { seq: 1, clubBatting: o.first, runs: o.first ? o.ours : o.theirs, wickets: o.first ? (o.wicketsUs ?? 5) : (o.wicketsThem ?? 5), allOut: o.first ? o.allOutUs : o.allOutThem, bat: o.first ? [{ who: 'c1', pos: 1, runs: 30 }] : [], bowl: o.first ? [] : [{ who: 'c2' }] },
    { seq: 2, clubBatting: !o.first, runs: o.first ? o.theirs : o.ours, wickets: o.first ? (o.wicketsThem ?? 5) : (o.wicketsUs ?? 5), allOut: o.first ? o.allOutThem : o.allOutUs, bat: o.first ? [] : [{ who: 'c1', pos: 1, runs: 30 }], bowl: o.first ? [{ who: 'c2' }] : [] },
  ],
})

describe('rolling', () => {
  const inn = (runs: number, status: 'out' | 'not_out' | 'unknown' = 'out') => ({ runs, status })
  it('draws an average only once the window holds enough dismissals', () => {
    const r = rollingBattingAverage([inn(10), inn(20), inn(30), inn(40)], 5, 3)
    expect(r).toEqual([null, null, 20, 25])
  })
  it('a window of not-outs is a gap, never 0 or infinite', () => {
    const r = rollingBattingAverage([inn(50, 'not_out'), inn(60, 'not_out'), inn(5, 'not_out')], 5, 1)
    expect(r).toEqual([null, null, null])
  })
  it('the window slides: only the last N known innings count, unknown status is skipped', () => {
    const r = rollingBattingAverage([inn(100), inn(0), inn(0), inn(0), inn(10, 'unknown'), inn(6)], 3, 2)
    // known: 100,0,0,0,6 -> last three at the end: 0,0,6 (2 outs among 0,0 plus 6 out = 3 outs) -> 6/3
    expect(r[5]).toBeCloseTo(2)
    expect(r[4]).toBeCloseTo(0)
  })
  it('fewer innings than the window still works', () => {
    expect(rollingBattingAverage([inn(9)], 5, 1)).toEqual([9])
    expect(rollingBattingAverage([], 5, 3)).toEqual([])
  })
  it('economy needs enough spells with balls and ignores a spell with none', () => {
    const r = rollingEconomy([{ balls: 24, runs: 24 }, { balls: 0, runs: 0 }, { balls: 24, runs: 12 }, { balls: 12, runs: 6 }], 5, 3)
    expect(r[0]).toBeNull()
    expect(r[2]).toBeNull()
    expect(r[3]).toBeCloseTo(42 / 10)
  })
})

describe('player trends', () => {
  const set = facts([
    { date: '2024-10-05', season: 2024, innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 40, status: 'out', balls: 50 }], bowl: [] }, { seq: 2, clubBatting: false, bowl: [{ who: 'c1', balls: 36, runs: 18, wickets: 2 }] }] },
    { date: '2024-10-12', season: 2024, innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 0, status: 'out', balls: 4 }] }] },
    { date: '2025-10-04', season: 2025, innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 12, status: 'not_out', balls: null }] }] },
    { date: '2025-10-11', season: 2025, innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, runs: 7, status: 'unknown', balls: 10 }] }] },
  ])
  it('lists innings in time order with duck and not-out', () => {
    const p = battingPoints(set, 101)
    expect(p.map((x) => x.runs)).toEqual([40, 0, 12, 7])
    expect(p[1].duck).toBe(true)
    expect(p[2].status).toBe('not_out')
    expect(p[2].balls).toBeNull()
  })
  it('bowling points keep only spells with balls', () => {
    const b = bowlingPoints(set, 101)
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ wickets: 2, runs: 18, balls: 36 })
  })
  it('season lines carry the sample behind every figure and never invent a number', () => {
    const [s24, s25] = seasonLines(set, 101)
    expect(s24).toMatchObject({ games: 2, innings: 2, usedInnings: 2, outs: 2, runs: 40, average: 20, ballInnings: 2, spells: 1, wickets: 2, economySpells: 1 })
    expect(s24.strikeRate).toBeCloseTo((40 / 54) * 100)
    expect(s24.economy).toBeCloseTo(3)
    // 2025: one not out with no balls, one unknown status.
    expect(s25).toMatchObject({ games: 2, innings: 2, usedInnings: 1, outs: 0, average: null, ballInnings: 1, spells: 0, economy: null })
  })
  it('compare: no label below the minimum, a label above it, about the same within the threshold', () => {
    const mk = (over: Partial<SeasonLine>): SeasonLine => ({ season: 's', startYear: 1, games: 8, innings: 8, usedInnings: 8, outs: 8, runs: 160, average: 20, ballInnings: 8, strikeRate: 80, wickets: 0, spells: 0, bowlBalls: 0, economy: null, economySpells: 0, ...over })
    const min = { innings: 5, balls: 72 }
    expect(compareSeasons(mk({ average: 30 }), mk({ average: 20 }), min).average).toEqual({ label: 'higher' })
    expect(compareSeasons(mk({ average: 10 }), mk({ average: 20 }), min).average).toEqual({ label: 'lower' })
    expect(compareSeasons(mk({ average: 21 }), mk({ average: 20 }), min).average).toEqual({ label: 'about the same' })
    expect(compareSeasons(mk({ average: 30, usedInnings: 4 }), mk({ average: 20 }), min).average).toEqual({ why: 'not enough games to compare' })
    expect(compareSeasons(mk({ average: null }), mk({ average: 20 }), min).average).toEqual({ why: 'not enough games to compare' })
    // economy needs balls; both seasons have none here
    expect(compareSeasons(mk({}), mk({}), min).economy).toEqual({ why: 'not enough games to compare' })
    expect(compareSeasons(mk({ bowlBalls: 100, economy: 6 }), mk({ bowlBalls: 100, economy: 4 }), min).economy).toEqual({ label: 'higher' })
  })
})

describe('margins', () => {
  const g = (spec: BundleSpec) => gameViews(facts([spec]))[0]
  it('runs margin when the winner batted first, from the innings order and not the toss', () => {
    expect(marginOf(g(game({ ours: 200, theirs: 150, first: true, result: 'won' })))).toEqual({ margin: { kind: 'runs', value: 50, clubWon: true } })
    // the opposition won batting first: our loss by runs
    expect(marginOf(g(game({ ours: 100, theirs: 160, first: false, result: 'lost' })))).toEqual({ margin: { kind: 'runs', value: 60, clubWon: false } })
  })
  it('wickets in hand when the winner chased', () => {
    expect(marginOf(g(game({ ours: 151, theirs: 150, first: false, result: 'won', wicketsUs: 3 })))).toEqual({ margin: { kind: 'wickets', value: 7, clubWon: true } })
    expect(marginOf(g(game({ ours: 90, theirs: 100, first: true, result: 'lost', wicketsThem: 2 })))).toEqual({ margin: { kind: 'wickets', value: 8, clubWon: false } })
  })
  it('does not compare forfeits, draws, one-innings games, missing totals or inconsistent totals', () => {
    expect(marginOf(g(game({ ours: 0, theirs: 0, first: true, result: 'won', forfeit: true })))).toEqual({ notComparable: 'forfeit' })
    expect(marginOf(g(game({ ours: 100, theirs: 100, first: true, result: 'draw' })))).toEqual({ notComparable: 'no_winner' })
    expect(marginOf(g({ result: 'won', innings: [{ seq: 1, clubBatting: true, runs: 100 }] }))).toEqual({ notComparable: 'innings_count' })
    expect(marginOf(g({ result: 'won', innings: [{ seq: 1, clubBatting: true, runs: 100 }, { seq: 2, clubBatting: true, runs: 90 }] }))).toEqual({ notComparable: 'order' })
    expect(marginOf(g(game({ ours: 100, theirs: 100, first: true, result: 'won' })))).toEqual({ notComparable: 'inconsistent' })
    expect(marginOf(g({ result: 'won', firstInnings: true, innings: [{ seq: 1, clubBatting: true, runs: 100 }, { seq: 2, clubBatting: false, runs: 90 }] }))).toEqual({ notComparable: 'order' })
    const none = g({ result: 'won', innings: [{ seq: 1, clubBatting: true, runs: 100 }, { seq: 2, clubBatting: false, runs: 90 }, { seq: 3, clubBatting: true, runs: 10 }, { seq: 4, clubBatting: false, runs: 0 }] })
    expect(marginOf(none)).toEqual({ notComparable: 'innings_count' })
  })
  it('buckets by upper bound and labels them', () => {
    expect(bucketLabels([20, 60], 'runs')).toEqual(['1 to 20 runs', '21 to 60 runs', '61 or more runs'])
    expect(bucketize([1, 20, 21, 60, 61, 300], [20, 60], 'runs').map((b) => b.count)).toEqual([2, 2, 2])
  })
  it('a spread shows only from the minimum games, otherwise only the count', () => {
    const wins = Array.from({ length: 4 }, (_, i) => game({ ours: 200 + i, theirs: 150, first: true, result: 'won', date: `2025-10-0${i + 1}` }))
    const four = marginSummary(gameViews(facts(wins)), 5)
    expect(four.wins.runs).toEqual({ n: 4, buckets: null })
    const five = marginSummary(gameViews(facts([...wins, game({ ours: 300, theirs: 100, first: true, result: 'won', date: '2025-10-09' })])), 5)
    expect(five.wins.runs.n).toBe(5)
    expect(five.wins.runs.buckets?.map((b) => b.count)).toEqual([0, 4, 0, 1])
    expect(five.notComparableTotal).toBe(0)
  })
  it('counts a forfeit as not comparable but not a draw', () => {
    const s = marginSummary(gameViews(facts([game({ ours: 0, theirs: 0, first: true, result: 'won', forfeit: true }), game({ ours: 1, theirs: 1, first: true, result: 'draw' })])))
    expect(s.notComparable).toEqual({ forfeit: 1 })
    expect(s.notComparableTotal).toBe(1)
  })
})

describe('team profile', () => {
  const specs = [
    game({ ours: 200, theirs: 150, first: true, result: 'won', date: '2025-10-04', allOutThem: true, wicketsThem: 10 }),
    game({ ours: 100, theirs: 160, first: true, result: 'lost', date: '2025-10-11', allOutUs: true, wicketsUs: 10 }),
    game({ ours: 151, theirs: 150, first: false, result: 'won', date: '2025-10-18', wicketsUs: 4 }),
    game({ ours: 0, theirs: 0, first: true, result: 'won', date: '2025-10-25', forfeit: true }),
    game({ ours: 120, theirs: 120, first: true, result: 'tie', date: '2025-11-01' }),
  ]
  const set = facts(specs)
  const toss = new Map<number, boolean | null>([[1, true], [2, false], [3, null]])
  const extras = new Map([['1:1', { extras: 10, wides: 4, noBalls: 1 }], ['1:2', { extras: 6, wides: 2, noBalls: 0 }]])
  const p = teamProfile({ set, toss, extras, winGames: 10, minGames: 2 })
  it('record leaves forfeits out and shows no win percentage below the minimum', () => {
    expect(p.record).toMatchObject({ played: 4, won: 2, lost: 1, tied: 1, winPct: null })
    expect(p.forfeits).toBe(1)
  })
  it('splits by innings order and by toss where recorded', () => {
    expect(p.battingFirst).toMatchObject({ played: 3, won: 1, lost: 1, tied: 1 })
    expect(p.battingSecond).toMatchObject({ played: 1, won: 1, winPct: null })
    expect(p.toss).toMatchObject({ recorded: 2, notRecorded: 2 })
    expect(p.toss.won).toMatchObject({ played: 1, won: 1 })
    expect(p.toss.lost).toMatchObject({ played: 1, lost: 1 })
  })
  it('batting numbers carry their sample and use only innings with totals and extras', () => {
    // The forfeit has no played innings, so four club innings.
    expect(p.batting.innings).toBe(4)
    expect(p.batting.mean).toBeCloseTo((200 + 100 + 151 + 120) / 4)
    expect(p.batting.highest).toBe(200)
    expect(p.batting.lowestCompleted).toBe(100)
    expect(p.batting.extrasPerInnings).toBe(10)
    expect(p.batting.extrasInnings).toBe(1)
    expect(p.bowling.widesPerInnings).toBe(2)
    expect(p.bowling.oppAllOut).toBe(1)
  })
  it('a rate below the minimum games is null', () => {
    expect(teamProfile({ set, toss, extras, winGames: 10, minGames: 50 }).batting.allOutRate).toBeNull()
    expect(teamProfile({ set, toss, extras, winGames: 10, minGames: 2 }).batting.allOutRate).not.toBeNull()
  })
  it('an empty set gives nulls and zeros, never NaN', () => {
    const e = teamProfile({ set: facts([]), toss: new Map(), extras: new Map(), winGames: 10 })
    expect(e.batting.mean).toBeNull()
    expect(e.batting.highest).toBeNull()
    expect(e.record.winPct).toBeNull()
    expect(JSON.stringify(e)).not.toMatch(/NaN|Infinity/)
  })
  it('typical winning total: median per grade, hidden below the minimum, count always shown', () => {
    const rows = parScores(gameViews(set), (g) => g ?? 'none', 2)
    expect(rows).toEqual([{ grade: 'Test Grade', winN: 1, winMedian: null, lossN: 1, lossMedian: null }])
    const more = parScores(gameViews(facts([...specs, game({ ours: 220, theirs: 100, first: true, result: 'won', date: '2025-11-08' })])), (g) => g ?? 'none', 2)
    expect(more[0]).toMatchObject({ winN: 2, winMedian: 210, lossN: 1, lossMedian: null })
  })
  it('median helper', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })
})

describe('team trends', () => {
  const set = facts([
    game({ ours: 100, theirs: 90, first: true, result: 'won', date: '2024-10-05', season: 2024 }),
    game({ ours: 120, theirs: 90, first: true, result: 'won', date: '2024-10-12', season: 2024 }),
    game({ ours: 80, theirs: 140, first: false, result: 'lost', date: '2025-10-04', season: 2025 }),
    game({ ours: 0, theirs: 0, first: true, result: 'lost', date: '2025-10-11', season: 2025, forfeit: true }),
    game({ ours: 90, theirs: 90, first: true, result: 'no_result', date: '2025-10-18', season: 2025 }),
  ])
  const games = gameViews(set).sort(byDate)
  it('last results, oldest first, forfeits marked and the length capped', () => {
    const s = lastResults(games, 3)
    expect(s.map((e) => e.code)).toEqual(['L', 'L', 'NR'])
    expect(s[1].forfeit).toBe(true)
    expect(lastResults(games, 10)).toHaveLength(5)
  })
  it('season averages count only innings with totals and report the cut', () => {
    const a = seasonAverages(games, 8)
    expect(a.rows.map((r) => [r.season.slice(-7), r.forN, r.forAvg])).toEqual([['2024/25', 2, 110], ['2025/26', 2, 85]])
    expect(seasonAverages(games, 1)).toMatchObject({ cut: 1 })
  })
  it('rolling first-innings total needs a full window', () => {
    const r = rollingFirstInnings(games, 2)
    // The forfeit has no innings; the lost game was chased by the other side, so it is not a batting-first game.
    expect(r.map((x) => x.total)).toEqual([100, 120, 90])
    expect(r.map((x) => x.rolling)).toEqual([null, 110, 105])
  })
})

describe('trend chart geometry', () => {
  const finite = (g: ReturnType<typeof buildTrend>) => expect(JSON.stringify(g)).not.toMatch(/NaN|Infinity|null,/)
  it('empty series', () => {
    const g = buildTrend({ labels: [] })
    expect(g.bars).toEqual([])
    expect(g.segments).toEqual([])
    expect(g.width).toBeGreaterThanOrEqual(320)
    finite(g)
  })
  it('single point and all zeros', () => {
    const g = buildTrend({ labels: ['a'], bars: [{ value: 0, text: '0' }], line: [0] })
    expect(g.bars).toHaveLength(1)
    expect(g.bars[0].h).toBeGreaterThanOrEqual(1)
    expect(g.dots).toHaveLength(1)
    finite(g)
  })
  it('a null is a gap that splits the line', () => {
    const g = buildTrend({ labels: ['a', 'b', 'c', 'd'], line: [1, 2, null, 4] })
    expect(g.segments).toHaveLength(2)
    expect(g.dots).toHaveLength(3)
  })
  it('bars scale to the largest value and the last label is always shown', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `d${i}`)
    const g = buildTrend({ labels, bars: labels.map((_, i) => ({ value: i * 10, text: String(i * 10) })) })
    expect(Math.max(...g.bars.map((b) => b.h))).toBeLessThanOrEqual(g.baseline)
    expect(g.xLabels[g.xLabels.length - 1].text).toBe('d11')
    finite(g)
  })
})

describe('config', () => {
  it('has sane thresholds', () => {
    expect(INSIGHTS.rollingInnings).toBeGreaterThanOrEqual(INSIGHTS.minOuts)
    expect(INSIGHTS.marginBuckets.runs).toEqual([...INSIGHTS.marginBuckets.runs].sort((a, b) => a - b))
  })
})
