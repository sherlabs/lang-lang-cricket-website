import { describe, expect, it } from 'vitest'
import { battingByPosition, bowlingByOrder, dangerBatters, dangerBowlers } from '@/lib/scouting/danger'
import { ledgerText, one, resultWord, scoreText, whole } from '@/lib/scouting/format'
import { gameRows, headToHead, ledgerOf } from '@/lib/scouting/head-to-head'
import { gamePlan, openingStands, resultsByOrder } from '@/lib/scouting/plan'
import { resolveOpponent, type OpponentOption } from '@/lib/scouting/resolve-opponent'
import { tossOf } from '@/lib/scouting/toss'
import { totalsOf } from '@/lib/scouting/totals'
import type { ScoutBat, ScoutBowl, ScoutInnings, ScoutMatch, ScoutPerson } from '@/lib/scouting/types'

let id = 0
const inn = (o: Partial<ScoutInnings> & { seq: number; clubBatting: boolean }): ScoutInnings => ({ played: true, runs: 150, wickets: 10, allOut: true, declared: false, hasFow: false, ...o })
const game = (o: Partial<ScoutMatch> = {}): ScoutMatch => ({
  id: ++id, gameId: `g${id}`, date: `2025-10-${String(10 + id).padStart(2, '0')}`, season: '2025/26', seasonYear: 2025, grade: 'A Grade', venue: 'Home Oval', isHome: true,
  result: 'won', forfeit: false, source: 'playhq', tossChoice: null, clubWonToss: null,
  innings: [inn({ seq: 1, clubBatting: true, runs: 180, wickets: 8, allOut: false }), inn({ seq: 2, clubBatting: false, runs: 120, wickets: 10 })],
  people: [], bat: [], bowl: [], ...o,
})
const person = (appearanceId: string, displayName: string, nameKey = displayName.toLowerCase().replace(' ', '|')): ScoutPerson => ({ appearanceId, nameKey, displayName })
const bat = (appearanceId: string, runs: number, status: ScoutBat['status'] = 'out', extra: Partial<ScoutBat> = {}): ScoutBat => ({ inningsSeq: 2, appearanceId, position: 1, status, runs, balls: null, fowWicket: null, fowRuns: null, ...extra })
const bowl = (appearanceId: string, balls: number, runs: number, wickets: number, order = 1): ScoutBowl => ({ inningsSeq: 1, appearanceId, order, balls, runs, wickets })

describe('head to head', () => {
  it('counts every kind of result separately, forfeits apart, and keeps a blank result as unknown', () => {
    const l = ledgerOf([
      game({ result: 'won' }), game({ result: 'lost' }), game({ result: 'draw' }), game({ result: 'tie' }), game({ result: 'no_result' }), game({ result: 'abandoned' }),
      game({ result: 'won', forfeit: true }), game({ result: 'lost', forfeit: true }), game({ result: null }),
    ])
    expect(l).toEqual({ played: 9, won: 1, lost: 1, drawn: 1, tied: 1, noResult: 2, unknown: 1, wonByForfeit: 1, lostByForfeit: 1 })
    expect(ledgerText(l)).toBe('Played 9: won 1, lost 1, drawn 1, tied 1, won by forfeit 1, lost by forfeit 1, no result 2, result not recorded 1')
  })
  it('handles no games and one game', () => {
    expect(ledgerText(ledgerOf([]))).toBe('Played 0')
    const h = headToHead([game()], 5)
    expect(h.total.played).toBe(1)
    expect(h.last?.ours).toEqual([{ runs: 180, wickets: 8 }])
    expect(h.theirRecent.map((t) => t.outcome)).toEqual(['L'])
  })
  it('splits home and away, seasons (newest first) and venues, and strips their recent results from their side', () => {
    const ms = [
      game({ date: '2024-10-01', season: '2024/25', seasonYear: 2024, isHome: false, venue: 'Their Oval', result: 'lost' }),
      game({ date: '2025-10-01', result: 'won' }),
      game({ date: '2025-10-08', result: 'draw', venue: 'Home Oval' }),
      game({ date: '2025-10-15', result: 'won', forfeit: true, venue: null }),
    ]
    const h = headToHead(ms, 2)
    expect(h.home.played).toBe(3)
    expect(h.away.played).toBe(1)
    expect(h.bySeason.map((s) => s.season)).toEqual(['2025/26', '2024/25'])
    expect(h.venues.map((v) => v.venue)).toEqual(['Home Oval', 'Their Oval'])
    expect(h.theirRecent).toEqual([{ gameId: ms[3].gameId, date: '2025-10-15', outcome: 'L', forfeit: true }, { gameId: ms[2].gameId, date: '2025-10-08', outcome: 'D', forfeit: false }])
    expect(h.last?.gameId).toBe(ms[3].gameId)
  })
  it('lists games newest first and writes scores honestly', () => {
    const rows = gameRows([game({ date: '2025-01-01' }), game({ date: '2025-03-01', innings: [inn({ seq: 1, clubBatting: true, runs: null, wickets: null })] })])
    expect(rows[0].date).toBe('2025-03-01')
    expect(scoreText(rows[0].ours)).toBe('not recorded')
    expect(scoreText(rows[1].ours)).toBe('180/8')
    expect(scoreText([])).toBe('not recorded')
  })
  it('words results', () => {
    expect(resultWord('won', true)).toBe('Won by forfeit')
    expect(resultWord(null, false)).toBe('Result not recorded')
    expect(one(null)).toBe('not recorded')
    expect(whole(null)).toBe('not recorded')
    expect(one(12.34)).toBe('12.3')
  })
})

describe('typical totals', () => {
  it('excludes innings with no total and counts them, never as 0', () => {
    const t = totalsOf([game(), game({ innings: [inn({ seq: 1, clubBatting: true, runs: 200 }), inn({ seq: 2, clubBatting: false, runs: null, wickets: null })] })])
    expect(t.theirs.all).toMatchObject({ n: 1, mean: 120, high: 120, low: 120, allOut: 1 })
    expect(t.theirs.excluded).toBe(1)
    expect(t.ours.all).toMatchObject({ n: 2, mean: 190 })
  })
  it('splits first innings and chasing only for one innings each, never for a two-day game', () => {
    const oneEach = game({ innings: [inn({ seq: 1, clubBatting: false, runs: 200 }), inn({ seq: 2, clubBatting: true, runs: 150 })] })
    const twoDay = game({ innings: [inn({ seq: 1, clubBatting: false, runs: 300 }), inn({ seq: 2, clubBatting: true, runs: 100 }), inn({ seq: 3, clubBatting: false, runs: 90 }), inn({ seq: 4, clubBatting: true, runs: 50 })] })
    const t = totalsOf([oneEach, twoDay])
    expect(t.theirs.first).toMatchObject({ n: 1, mean: 200 })
    expect(t.theirs.chasing.n).toBe(0)
    expect(t.theirs.all.n).toBe(3)
    expect(t.ours.chasing).toMatchObject({ n: 1, mean: 150 })
  })
  it('has no mean for no innings and a mean wickets only over recorded counts', () => {
    expect(totalsOf([]).theirs.all).toMatchObject({ n: 0, mean: null, high: null, low: null, meanWickets: null })
    const t = totalsOf([game({ innings: [inn({ seq: 1, clubBatting: false, runs: 100, wickets: null })] })])
    expect(t.theirs.all.wicketsN).toBe(0)
    expect(t.theirs.all.meanWickets).toBeNull()
  })
})

describe('toss', () => {
  it('counts only recorded tosses and what they chose after winning', () => {
    const s = tossOf([
      game({ clubWonToss: false, tossChoice: 'bowl', result: 'lost' }), game({ clubWonToss: false, tossChoice: 'bat', result: 'won' }),
      game({ clubWonToss: false, tossChoice: null, result: 'draw' }), game({ clubWonToss: true, tossChoice: 'bat' }), game({ clubWonToss: null, tossChoice: null }),
    ])
    expect(s).toEqual({ known: 4, theyWon: 3, chose: { bat: 1, bowl: 1 }, choiceUnknown: 1, ourResultAfter: { won: 1, lost: 1, other: 1 } })
  })
  it('is all zero with no toss data', () => {
    expect(tossOf([game()]).known).toBe(0)
  })
})

describe('danger players', () => {
  const people = [person('a', 'Aaron Archer'), person('b', 'Blake Baxter'), person('c', 'Cody Calder')]
  const g1 = game({ date: '2025-10-01', people, bat: [bat('a', 60), bat('b', 5, 'not_out', { position: 3 }), bat('c', 10, 'did_not_bat')], bowl: [bowl('a', 36, 30, 3), bowl('b', 6, 10, 0, 2)] })
  const g2 = game({ date: '2025-10-08', people, bat: [bat('a', 10, 'not_out'), bat('b', 7, 'not_out', { position: 3 })], bowl: [bowl('a', 30, 40, 1)] })
  it('lists a batter only from the minimum innings, gives no average without a dismissal, and shows the last innings oldest first', () => {
    const rows = dangerBatters([g2, g1], { minInnings: 2, top: 5, recent: 5 })
    expect(rows.map((r) => r.name)).toEqual(['Aaron Archer', 'Blake Baxter'])
    const aaron = rows[0]
    expect(aaron).toMatchObject({ innings: 2, runs: 70, outs: 1, average: 70, highScore: 60, fifties: 1 })
    expect(aaron.recent).toEqual(['60', '10*'])
    expect(rows[1]).toMatchObject({ innings: 2, outs: 0, average: null })
    expect(dangerBatters([g1, g2], { minInnings: 3, top: 5, recent: 5 })).toEqual([])
    expect(dangerBatters([g1, g2], { minInnings: 2, top: 1, recent: 1 })[0].recent).toEqual(['10*'])
  })
  it('lists a bowler from the minimum balls and gives economy only then', () => {
    const rows = dangerBowlers([g1, g2], { minBalls: 24, top: 5, recent: 5 })
    expect(rows.map((r) => r.name)).toEqual(['Aaron Archer'])
    expect(rows[0]).toMatchObject({ spells: 2, balls: 66, runs: 70, wickets: 4 })
    expect(rows[0].economy).toBeCloseTo(70 / 11, 5)
    expect(rows[0].recent).toEqual(['3/30', '1/40'])
  })
  it('flags two players of one name in one game, and merges nothing silently', () => {
    const twins = game({ people: [person('a', 'Sam Smith'), person('b', 'Sam Smith')], bat: [bat('a', 30), bat('b', 20)] })
    const rows = dangerBatters([twins, twins], { minInnings: 1, top: 5, recent: 5 })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ innings: 4, possiblyMerged: true })
  })
  it('skips rows with no name key', () => {
    const anon = game({ people: [{ appearanceId: 'a', nameKey: null, displayName: null }], bat: [bat('a', 99)] })
    expect(dangerBatters([anon], { minInnings: 1, top: 5, recent: 5 })).toEqual([])
  })
  it('the no-names view carries no names and respects the minimums', () => {
    const rows = battingByPosition([g1, g2], 2)
    expect(rows).toEqual([{ position: 1, innings: 2, runs: 70, outs: 1, average: 70, highScore: 60 }, { position: 3, innings: 2, runs: 12, outs: 0, average: null, highScore: 7 }])
    expect(JSON.stringify([rows, bowlingByOrder([g1, g2], 24)])).not.toMatch(/Archer|Baxter|Calder/)
    expect(bowlingByOrder([g1, g2], 24)).toEqual([expect.objectContaining({ order: 1, balls: 66, wickets: 4 })])
  })
})

describe('game plan', () => {
  const tossed = (n: number, choice: 'bat' | 'bowl') => Array.from({ length: n }, () => game({ clubWonToss: false, tossChoice: choice }))
  it('cites its number and sample, and fires only at the threshold', () => {
    const at = [...tossed(4, 'bowl'), ...tossed(1, 'bat')]
    const below = at.slice(1)
    const plan = (ms: ScoutMatch[]) => gamePlan({ matches: ms, totals: totalsOf(ms), toss: tossOf(ms), minSample: 5, earlyWicketRuns: 10 })
    expect(plan(at).find((p) => p.id === 'toss-choice')?.text).toBe('They chose to bowl in 4 of the 5 tosses they won (n=5).')
    expect(plan(below).find((p) => p.id === 'toss-choice')).toBeUndefined()
    expect(plan([...tossed(3, 'bowl'), ...tossed(3, 'bat')]).find((p) => p.id === 'toss-choice')?.text).toMatch(/equally often \(3 each\)/)
    expect(plan(at).find((p) => p.id === 'their-all-out')?.text).toBe('Their innings ended all out in 5 of 5 (n=5).')
  })
  it('says nothing when no rule has the sample', () => {
    expect(gamePlan({ matches: [game()], totals: totalsOf([game()]), toss: tossOf([game()]), minSample: 5, earlyWicketRuns: 10 })).toEqual([])
  })
  it('counts early wickets only from stored fall of wickets, and no wicket is not early', () => {
    const withFow = (firstRuns: number | null) => game({
      innings: [inn({ seq: 1, clubBatting: true }), inn({ seq: 2, clubBatting: false, hasFow: true })],
      bat: firstRuns === null ? [] : [bat('a', 3, 'out', { fowWicket: 1, fowRuns: firstRuns })],
    })
    expect(openingStands([withFow(4), withFow(10), withFow(11), withFow(null), game()], 10)).toEqual({ n: 4, early: 2 })
    const five = [withFow(4), withFow(9), withFow(10), withFow(30), withFow(null)]
    expect(gamePlan({ matches: five, totals: totalsOf(five), toss: tossOf(five), minSample: 5, earlyWicketRuns: 10 }).find((p) => p.id === 'early-wicket')?.text)
      .toBe('Opening partnership against them: 3 of 5 started with a wicket by 10 runs (n=5).')
  })
  it('splits our results by who batted first among decided one-each games, ignoring forfeits and ties', () => {
    const theyFirst = game({ innings: [inn({ seq: 1, clubBatting: false }), inn({ seq: 2, clubBatting: true })], result: 'won' })
    const weFirst = game({ innings: [inn({ seq: 1, clubBatting: true }), inn({ seq: 2, clubBatting: false })], result: 'lost' })
    const ignored = [game({ result: 'tie' }), game({ result: 'won', forfeit: true })]
    expect(resultsByOrder([theyFirst, weFirst, ...ignored])).toEqual({ theyBatFirst: { n: 1, weWon: 1 }, weBatFirst: { n: 1, weWon: 0 } })
  })
})

describe('resolve opponent', () => {
  const options: OpponentOption[] = [
    { key: 'org-1', label: 'Warragul CC', names: ['warragul cc', 'warragul cc a grade'] },
    { key: 'org-2', label: 'Warragul CC', names: ['warragul cc'] },
    { key: 'n:bunyip-creek', label: 'Bunyip Creek', names: ['bunyip creek'] },
  ]
  it('matches a name, ignoring case and punctuation', () => {
    expect(resolveOpponent('  BUNYIP  creek. ', options)).toEqual({ kind: 'one', key: 'n:bunyip-creek', label: 'Bunyip Creek' })
    expect(resolveOpponent('Warragul CC A Grade', options)).toEqual({ kind: 'one', key: 'org-1', label: 'Warragul CC' })
  })
  it('returns both candidates for two clubs whose names normalise alike, never one', () => {
    const r = resolveOpponent('warragul cc', options)
    expect(r.kind).toBe('many')
    expect(r.kind === 'many' && r.candidates.map((c) => c.key)).toEqual(['org-1', 'org-2'])
  })
  it('gives same-named candidates different details (imported history vs PlayHQ, games played)', () => {
    const r = resolveOpponent('warragul cc', [
      { key: 'n:warragul-cc', label: 'Warragul CC', names: ['warragul cc'], played: 1 },
      { key: 'org-1', label: 'Warragul CC', names: ['warragul cc'], played: 4 },
    ])
    expect(r.kind === 'many' && r.candidates.map((c) => c.detail)).toEqual(['1 game, imported history', '4 games, PlayHQ club'])
  })
  it('is none for no name or an unknown club', () => {
    expect(resolveOpponent('', options)).toEqual({ kind: 'none' })
    expect(resolveOpponent(null, options)).toEqual({ kind: 'none' })
    expect(resolveOpponent('Nobody CC', options)).toEqual({ kind: 'none' })
  })
})
