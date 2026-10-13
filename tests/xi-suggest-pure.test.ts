import { describe, expect, it } from 'vitest'
import { SELECTION } from '../config/site'
import { teamWarnings, DEFAULT_RULES, MIN_BATTERS, MIN_BOWLERS } from '../lib/selection/warnings'
import { resolveXiRules } from '../lib/selection/store'
import { keeper, left, pinned, suggestHref } from '../lib/selection/xi-links'
import { suggestXi, type XiPlayer, type XiInput } from '../lib/selection/xi'

const bat = (...runs: number[]) => runs.map((r, i) => ({ date: `2026-0${9 - i}-01`, runs: r, notOut: false }))
const bowl = (...spells: [number, number][]) => spells.map(([wickets, runs], i) => ({ date: `2026-0${9 - i}-01`, wickets, runs }))
let seq = 0
const pl = (name: string, over: Partial<XiPlayer> = {}): XiPlayer => ({ id: ++seq, name, role: 'batter', roleSource: 'selectors', answer: 'in', alsoPickedIn: null, battingEntries: [], bowlingEntries: [], gamesThisSeason: 0, positions: [], ...over })
const rules = { minBowlers: 5, minBatters: 5, requireKeeper: true, treatNoAnswerAsMaybe: true }
const run = (players: XiPlayer[], over: Partial<XiInput> = {}) => suggestXi({ players, rules, size: 11, pins: [], leaves: [], ...over })
const names = (r: ReturnType<typeof run>) => r.picks.map((p) => p.name)

/** A realistic squad of 14: one keeper, five bowlers, one all-rounder, seven batters. */
function squad(): XiPlayer[] {
  seq = 0
  return [
    pl('Kev Keeper', { role: 'keeper', battingEntries: bat(20, 30, 10) }),
    ...['B1', 'B2', 'B3', 'B4', 'B5'].map((n, i) => pl(n, { role: 'bowler', bowlingEntries: bowl([i, 20], [1, 30], [0, 25]) })),
    pl('Alan AllRound', { role: 'all-rounder', battingEntries: bat(15, 5, 25), bowlingEntries: bowl([2, 22], [1, 18], [0, 30]) }),
    ...['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((n, i) => pl(n, { role: 'batter', battingEntries: bat(10 * (i + 1), 5, 0) })),
  ]
}

describe('suggestXi: fill order and rules', () => {
  it('fills a keeper, then bowlers, then batters, then the best of the rest, to the team size', () => {
    const r = run(squad())
    expect(r.picks).toHaveLength(11)
    expect(r.picks.filter((p) => p.isKeeper).map((p) => p.name)).toEqual(['Kev Keeper'])
    expect(r.picks.find((p) => p.name === 'Kev Keeper')!.need).toBe('keeper')
    expect(r.picks.filter((p) => p.need === 'bowler')).toHaveLength(5)
    const roles = r.picks.map((p) => p.role)
    expect(roles.filter((x) => x === 'bowler' || x === 'all-rounder').length).toBeGreaterThanOrEqual(5)
    expect(roles.filter((x) => x === 'batter' || x === 'all-rounder' || x === 'keeper').length).toBeGreaterThanOrEqual(5)
  })

  it('an all-rounder satisfies both a bowling and a batting need', () => {
    seq = 0
    const four = [pl('K', { role: 'keeper' }), pl('A', { role: 'all-rounder' }), pl('B', { role: 'bowler' }), pl('C', { role: 'bowler' })]
    const r = suggestXi({ players: four, rules: { ...rules, minBowlers: 3, minBatters: 2 }, size: 4, pins: [], leaves: [] })
    expect(names(r).sort()).toEqual(['A', 'B', 'C', 'K'])
    expect(r.notes).toEqual([])
  })

  it('with a keeper required and none available it says so and still fills the team', () => {
    seq = 0
    const ps = [pl('A'), pl('B', { role: 'bowler' }), pl('C')]
    const r = suggestXi({ players: ps, rules: { ...rules, minBowlers: 1, minBatters: 1 }, size: 3, pins: [], leaves: [] })
    expect(r.picks).toHaveLength(3)
    expect(r.keeperId).toBeNull()
    expect(r.notes.join(' ')).toMatch(/No wicketkeeper is available/)
  })

  it('does not look for a keeper when the rule is off, but still tags a keeper who is picked', () => {
    seq = 0
    const ps = [pl('Wick', { role: 'keeper' }), pl('B')]
    const r = suggestXi({ players: ps, rules: { ...rules, requireKeeper: false, minBowlers: 0, minBatters: 0 }, size: 2, pins: [], leaves: [] })
    expect(r.notes).toEqual([])
    expect(r.picks.find((p) => p.name === 'Wick')!.isKeeper).toBe(true)
    expect(r.picks.find((p) => p.name === 'Wick')!.need).toBe('best')
  })

  it('fewer players than places: everyone is picked and the shortfall is stated', () => {
    seq = 0
    const r = run([pl('A'), pl('B'), pl('C')])
    expect(r.picks).toHaveLength(3)
    expect(r.notes.join(' ')).toContain('Only 3 players are available for a team of 11')
  })

  it('a team of no limit is suggested at the configured open size and says so', () => {
    const r = run(squad(), { size: 0 })
    expect(r.size).toBe(SELECTION.xi.openTeamSize)
    expect(r.notes[0]).toContain('No team size is set')
  })

  it('the rules parameter changes the result', () => {
    const base = run(squad())
    const fewer = run(squad(), {})
    expect(names(fewer)).toEqual(names(base))
    seq = 0
    const s = squad()
    const tight = suggestXi({ players: s, rules: { ...rules, minBowlers: 2, minBatters: 8 }, size: 11, pins: [], leaves: [] })
    const loose = suggestXi({ players: s, rules: { ...rules, minBowlers: 6, minBatters: 2 }, size: 11, pins: [], leaves: [] })
    const bowlers = (r: typeof tight) => r.picks.filter((p) => p.role === 'bowler' || p.role === 'all-rounder').length
    expect(bowlers(loose)).toBeGreaterThan(bowlers(tight))
  })

  it('is deterministic: the same input twice (and in reverse order) is deep-equal', () => {
    const s = squad()
    expect(run(s)).toEqual(run(s))
    expect(run([...s].reverse())).toEqual(run(s))
  })
})

describe('suggestXi: ranking inside a need', () => {
  const two = (a: Partial<XiPlayer>, b: Partial<XiPlayer>, metric: 'bat' | 'bowl' = 'bat') => {
    seq = 0
    const x = pl('Aaron', { role: metric === 'bat' ? 'batter' : 'bowler', ...a })
    const y = pl('Brett', { role: metric === 'bat' ? 'batter' : 'bowler', ...b })
    return names(suggestXi({ players: [y, x], rules: { ...rules, requireKeeper: false, minBowlers: metric === 'bowl' ? 1 : 0, minBatters: metric === 'bat' ? 1 : 0 }, size: 1, pins: [], leaves: [] }))[0]
  }
  it('availability beats everything', () => expect(two({ answer: 'maybe', battingEntries: bat(90, 90, 90) }, { answer: 'in', battingEntries: bat(1, 0, 0) })).toBe('Brett'))
  it('maybe ranks before no answer', () => expect(two({ answer: 'none' }, { answer: 'maybe' })).toBe('Brett'))
  it('enough data (3 entries) beats a better line on thin data', () => expect(two({ battingEntries: bat(90) }, { battingEntries: bat(5, 5, 5) })).toBe('Brett'))
  it('batting: more runs in the last five wins', () => expect(two({ battingEntries: bat(10, 10, 10) }, { battingEntries: bat(20, 20, 20) })).toBe('Brett'))
  it('bowling: more wickets wins, then fewer runs conceded', () => {
    expect(two({ bowlingEntries: bowl([1, 10], [1, 10], [1, 10]) }, { bowlingEntries: bowl([2, 50], [1, 50], [1, 50]) }, 'bowl')).toBe('Brett')
    expect(two({ bowlingEntries: bowl([1, 40], [1, 40], [1, 40]) }, { bowlingEntries: bowl([1, 10], [1, 10], [1, 10]) }, 'bowl')).toBe('Brett')
  })
  it('then games this season, then name', () => {
    expect(two({ battingEntries: bat(5, 5, 5), gamesThisSeason: 2 }, { battingEntries: bat(5, 5, 5), gamesThisSeason: 9 })).toBe('Brett')
    expect(two({ battingEntries: bat(5, 5, 5), gamesThisSeason: 4 }, { battingEntries: bat(5, 5, 5), gamesThisSeason: 4 })).toBe('Aaron')
  })
  it('a player with no stored games ranks below players with data and reads No data, never a zero line', () => {
    seq = 0
    const none = pl('Zed Newbie')
    const some = pl('Ann Data', { battingEntries: bat(0, 0, 0) })
    const r = suggestXi({ players: [none, some], rules: { ...rules, requireKeeper: false, minBowlers: 0, minBatters: 1 }, size: 1, pins: [], leaves: [] })
    expect(names(r)).toEqual(['Ann Data'])
    expect(r.reserves[0].reason).toContain('No batting data')
    expect(r.reserves[0].reason).not.toMatch(/\b0 runs\b/)
  })
})

describe('suggestXi: availability, exclusions, pins', () => {
  it('out players and players in another grade are excluded with the reason', () => {
    seq = 0
    const ps = [pl('Ok'), pl('Away', { answer: 'out' }), pl('Busy', { alsoPickedIn: 'A Grade' })]
    const r = run(ps)
    expect(names(r)).toEqual(['Ok'])
    expect(r.excluded.map((x) => [x.name, x.code, x.reason])).toEqual([
      ['Away', 'out', 'Out. They said they are out for this game.'],
      ['Busy', 'other-grade', 'Already in A Grade.'],
    ])
  })
  it('no answer counts as maybe by default and is excluded when the setting is off', () => {
    seq = 0
    const ps = [pl('Quiet', { answer: 'none' })]
    expect(names(run(ps))).toEqual(['Quiet'])
    const off = suggestXi({ players: ps, rules: { ...rules, treatNoAnswerAsMaybe: false }, size: 11, pins: [], leaves: [] })
    expect(off.picks).toEqual([])
    expect(off.excluded[0]).toMatchObject({ code: 'no-answer' })
  })
  it('a pin keeps a player in, even one who is out, and says "Pinned by you"', () => {
    seq = 0
    const away = pl('Away', { answer: 'out' })
    const r = run([pl('A'), away], { pins: [away.id] })
    expect(names(r)).toContain('Away')
    const pick = r.picks.find((p) => p.name === 'Away')!
    expect(pick.pinned).toBe(true)
    expect(pick.reason).toMatch(/^Pinned by you\./)
    expect(pick.reason).toContain('Out (said they are out')
  })
  it('a leave-out removes a player and says "Left out by you"; a pin wins over a leave-out', () => {
    seq = 0
    const a = pl('A')
    const b = pl('B')
    const r = run([a, b], { leaves: [b.id] })
    expect(names(r)).toEqual(['A'])
    expect(r.excluded).toEqual([{ id: b.id, name: 'B', code: 'left-out', reason: 'Left out by you.' }])
    expect(names(run([a, b], { leaves: [b.id], pins: [b.id] }))).toContain('B')
  })
  it('ids that are not in the pool are ignored', () => {
    seq = 0
    const a = pl('A')
    expect(run([a], { pins: [99999], leaves: [88888], keeperId: 77777 })).toEqual(run([a]))
  })
  it('the keeper choice pins that player and tags them; a keeper-role player is otherwise tagged', () => {
    seq = 0
    const w = pl('Wk', { role: 'keeper' })
    const other = pl('Other', { role: 'batter' })
    const r = run([w, other], { keeperId: other.id })
    expect(r.keeperId).toBe(other.id)
    expect(r.picks.find((p) => p.id === other.id)!.isKeeper).toBe(true)
    expect(r.picks.find((p) => p.id === w.id)!.isKeeper).toBe(false)
    expect(run([w, other]).keeperId).toBe(w.id)
  })
  it('pinning more players than places is flagged in the notes', () => {
    seq = 0
    const ps = Array.from({ length: 4 }, (_, i) => pl(`P${i}`))
    expect(run(ps, { size: 2, pins: ps.map((p) => p.id) }).notes.join(' ')).toContain('pinned 4 players for a team of 2')
  })
})

describe('suggestXi: explanations', () => {
  it('a keeper pick reads like the spec example and contains only recorded numbers', () => {
    seq = 0
    const k = pl('Kay', { role: 'keeper', battingEntries: [{ date: '2026-09-01', runs: 34, notOut: false }, { date: '2026-08-01', runs: 12, notOut: true }, { date: '2026-07-01', runs: 0, notOut: false }, { date: '2026-06-01', runs: 51, notOut: false }, { date: '2026-05-01', runs: 8, notOut: false }] })
    const r = run([k])
    expect(r.picks[0].reason).toBe('Keeper (keeper, role set by selectors). In. Last five bats: 34, 12*, 0, 51, 8.')
  })
  it('reserves say why not picked, with the next bowler in line and its recorded numbers', () => {
    seq = 0
    const ps = [pl('Bow1', { role: 'bowler', bowlingEntries: bowl([3, 20], [2, 20], [1, 20]) }), pl('Bow2', { role: 'bowler', bowlingEntries: bowl([1, 20], [1, 20], [0, 20]) })]
    const r = suggestXi({ players: ps, rules: { ...rules, requireKeeper: false, minBowlers: 1, minBatters: 0 }, size: 1, pins: [], leaves: [] })
    expect(names(r)).toEqual(['Bow1'])
    expect(r.reserves[0].reason).toContain('Next bowler in line: 2 wickets in last 3 spells')
  })
  it('a stats-suggested role is labelled as such', () => {
    seq = 0
    const r = run([pl('S', { role: 'bowler', roleSource: 'stats' })])
    expect(r.picks[0].reason).toContain('role suggested from stored games')
  })
  it('no adjectives that imply a score', () => {
    const text = JSON.stringify(run(squad()))
    expect(text).not.toMatch(/\bbest form\b|\bform \d|\bscore of\b|\brating\b/i)
  })
})

describe('suggestXi: batting order', () => {
  it('orders by median stored position when there are enough innings, everyone else last and marked', () => {
    seq = 0
    const opener = pl('Opener', { positions: [1, 2, 1] })
    const number5 = pl('Five', { positions: [5, 4, 5, 6] })
    const thin = pl('Thin', { positions: [1, 1] })
    const none = pl('NoData')
    const r = run([none, thin, number5, opener])
    expect(names(r)).toEqual(['Opener', 'Five', 'NoData', 'Thin'])
    expect(r.picks.map((p) => p.orderSuggested)).toEqual([true, true, false, false])
    expect(r.picks.map((p) => p.order)).toEqual([1, 2, 3, 4])
    expect(r.picks[0].medianPosition).toBe(1)
    expect(r.picks[1].medianPosition).toBe(5)
  })
  it('the threshold is the configured number of innings', () => {
    seq = 0
    const p = pl('Edge', { positions: Array(SELECTION.xi.orderMinInnings - 1).fill(3) })
    expect(run([p]).picks[0].orderSuggested).toBe(false)
    const q = pl('Edge2', { positions: Array(SELECTION.xi.orderMinInnings).fill(3) })
    expect(run([q]).picks[0].orderSuggested).toBe(true)
  })
})

describe('balance rules reach teamWarnings', () => {
  const slot = (role: 'bowler' | 'batter') => ({ name: 'x', kind: 'player' as const, role, isCaptain: false, isKeeper: false })
  const input = { slots: [slot('bowler'), slot('bowler'), slot('batter'), slot('batter')], size: 0 as const, fixtureStatus: 'upcoming' as const, fixtureMovedSinceSave: false }
  const codes = (r?: Parameters<typeof teamWarnings>[1]) => teamWarnings(input, r).map((w) => w.code)
  it('the old constants stay exported and are the defaults', () => {
    expect([MIN_BOWLERS, MIN_BATTERS]).toEqual([5, 5])
    expect(DEFAULT_RULES).toMatchObject({ minBowlers: 5, minBatters: 5 })
    expect(codes()).toEqual(codes(DEFAULT_RULES))
    expect(codes()).toContain('few-bowlers')
  })
  it('lower numbers silence the warnings; the keeper rule can be switched off', () => {
    expect(codes({ minBowlers: 2, minBatters: 2, requireKeeper: false })).toEqual(['no-captain'])
    expect(codes({ minBowlers: 2, minBatters: 2 })).toContain('no-keeper')
  })
  it('the warning text cites the configured number', () => {
    expect(teamWarnings(input, { minBowlers: 3, minBatters: 2 }).find((w) => w.code === 'few-bowlers')!.text).toContain('aim for 3')
  })
})

describe('settings values', () => {
  it('a never-saved group gives the config defaults', () => {
    expect(resolveXiRules(undefined)).toEqual({ minBowlers: SELECTION.xi.minBowlers, minBatters: SELECTION.xi.minBatters, requireKeeper: true, treatNoAnswerAsMaybe: true })
  })
  it('stored numbers (also as numeric strings from the database) are used, junk falls back', () => {
    expect(resolveXiRules({ minBowlers: '3', minBatters: 4, requireKeeper: false, treatNoAnswerAsMaybe: false })).toEqual({ minBowlers: 3, minBatters: 4, requireKeeper: false, treatNoAnswerAsMaybe: false })
    expect(resolveXiRules({ minBowlers: -1, minBatters: 99 })).toMatchObject({ minBowlers: 5, minBatters: 5 })
  })
})

describe('override links', () => {
  const g = 'game-1'
  it('build an address from state and drop empty parts', () => {
    expect(suggestHref(g, { pins: [], leaves: [], keeperId: null })).toBe('/selector/teams/game-1/suggest')
    expect(suggestHref(g, { pins: [3, 1], leaves: [2], keeperId: 5 })).toBe('/selector/teams/game-1/suggest?pin=1%2C3&leave=2&keeper=5')
  })
  it('pin, leave and keeper toggle and stay exclusive', () => {
    const s = { pins: [1], leaves: [2], keeperId: 3 }
    expect(pinned(s, 2)).toEqual({ pins: [1, 2], leaves: [], keeperId: 3 })
    expect(pinned(s, 1).pins).toEqual([])
    expect(left(s, 1)).toEqual({ pins: [], leaves: [2, 1], keeperId: 3 })
    expect(left(s, 3).keeperId).toBeNull()
    expect(keeper(s, 3).keeperId).toBeNull()
    expect(keeper(s, 1)).toEqual({ pins: [], leaves: [2], keeperId: 1 })
    // an automatically chosen keeper is not in state: the link locks them in, a second tap clears it
    const auto = { pins: [], leaves: [], keeperId: null }
    expect(keeper(auto, 26).keeperId).toBe(26)
    expect(keeper(keeper(auto, 26), 26).keeperId).toBeNull()
  })
})
