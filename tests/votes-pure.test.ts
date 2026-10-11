import { describe, expect, it } from 'vitest'
import { canVote, nomineesFor, picksFromForm, validateBallot, voteWord } from '@/lib/votes/ballot'
import { buildRace } from '@/lib/votes/chart'
import { votesCsv } from '@/lib/votes/csv'
import { buildRevealSteps, buildSnapshot } from '@/lib/votes/present'
import { DEFAULT_VOTE_SETTINGS, parseBallotValues, pinWarning, scopeAllows, settingsFrom, suggestedMinimum } from '@/lib/votes/settings'
import { addDays, editWindowOpen, isCounting, seasonStartYearOfDate, voteStatus, windowClosesAt } from '@/lib/votes/status'
import { tally, type PlayerInfo, type TallyBallot, type TallyFixture } from '@/lib/votes/tally'

const S = { voteWindowDays: 7, editWindowHours: 24 }
const fx = (o: Partial<{ status: string; localDate: string; votesState: string | null }> = {}) => ({ status: 'final', localDate: '2026-10-10', votesState: 'auto', ...o })
const at = (iso: string) => new Date(iso)

describe('parseBallotValues and settingsFrom', () => {
  it('accepts descending positive integers, one to five', () => {
    expect(parseBallotValues('3,2,1')).toEqual([3, 2, 1])
    expect(parseBallotValues('5, 3, 1')).toEqual([5, 3, 1])
    expect(parseBallotValues('2,1')).toEqual([2, 1])
    expect(parseBallotValues('1')).toEqual([1])
    expect(parseBallotValues([3, 2, 1])).toEqual([3, 2, 1])
  })
  it('rejects ascending, equal, too many, zero and non-integers', () => {
    for (const bad of ['1,2,3', '3,3,1', '6,5,4,3,2,1', '3,0', '3,1.5', '', 'a,b', null, 7, '3,-1'] as unknown[]) expect(parseBallotValues(bad), String(bad)).toBeNull()
  })
  it('clamps a corrupt row to safe defaults and floors the minimum at 3', () => {
    expect(settingsFrom(null)).toEqual(DEFAULT_VOTE_SETTINGS)
    const s = settingsFrom({ votes: { enabled: true, ballotValues: 'nonsense', minBallotsToCount: 1, voteWindowDays: 9999, editWindowHours: -4, publicScope: 'weird' } })
    expect(s.enabled).toBe(true)
    expect(s.ballotValues).toEqual([3, 2, 1])
    expect(s.minBallotsToCount).toBe(3)
    expect(s.voteWindowDays).toBe(60)
    expect(s.editWindowHours).toBe(0)
    expect(s.publicScope).toBe('club')
    expect(settingsFrom({ minBallotsToCount: '8' }).minBallotsToCount).toBe(8)
  })
  it('scope, PIN warning and the suggested minimum', () => {
    expect(scopeAllows({ publicScope: 'both' }, 'grade')).toBe(true)
    expect(scopeAllows({ publicScope: 'club' }, 'grade')).toBe(false)
    expect(pinWarning(0)).toBeNull()
    expect(pinWarning(1)).toMatch(/^1 player still uses/)
    expect(pinWarning(7)).toMatch(/^7 players still use/)
    expect(suggestedMinimum(20)).toBe(8)
    expect(suggestedMinimum(4)).toBe(3)
  })
})

describe('vote status and windows', () => {
  it('is pending until the game is final', () => expect(voteStatus(fx({ status: 'upcoming' }), S, at('2026-10-11T00:00:00Z'))).toBe('pending'))
  it('auto: open through the end of the local day N days after the game, then closed, with no stored write', () => {
    // Melbourne in October is UTC+11. Game 2026-10-10, window 7 days: open through the local day 2026-10-17.
    expect(voteStatus(fx(), S, at('2026-10-17T12:00:00Z'))).toBe('open') // 23:00 local on the 17th
    expect(voteStatus(fx(), S, at('2026-10-17T13:30:00Z'))).toBe('closed') // 00:30 local on the 18th
    expect(addDays('2026-10-10', 7)).toBe('2026-10-17')
    expect(windowClosesAt('2026-10-10', 7)?.toISOString()).toBe('2026-10-17T13:00:00.000Z')
  })
  it('open and closed override the computed window', () => {
    expect(voteStatus(fx({ votesState: 'open' }), S, at('2027-01-01T00:00:00Z'))).toBe('open')
    expect(voteStatus(fx({ votesState: 'closed' }), S, at('2026-10-11T00:00:00Z'))).toBe('closed')
  })
  it('counting means final and not excluded', () => {
    expect(isCounting({ status: 'final', countsForAwards: true })).toBe(true)
    expect(isCounting({ status: 'final', countsForAwards: false })).toBe(false)
    expect(isCounting({ status: 'upcoming', countsForAwards: true })).toBe(false)
  })
  it('edit window: inside, boundary, and the window close wins', () => {
    const cast = '2026-10-11T00:00:00Z'
    expect(editWindowOpen(fx(), cast, S, at('2026-10-11T23:59:00Z'))).toBe(true)
    expect(editWindowOpen(fx(), cast, S, at('2026-10-12T00:00:00Z'))).toBe(false)
    // cast late on the last day: 24 hours would run past the close, the close wins
    expect(editWindowOpen(fx(), '2026-10-17T12:00:00Z', S, at('2026-10-17T14:00:00Z'))).toBe(false)
    expect(editWindowOpen(fx({ votesState: 'closed' }), cast, S, at('2026-10-11T01:00:00Z'))).toBe(false)
  })
  it('season of a date follows the season start month', () => {
    expect(seasonStartYearOfDate('2026-10-10', 7)).toBe(2026)
    expect(seasonStartYearOfDate('2027-03-01', 7)).toBe(2026)
    expect(seasonStartYearOfDate('2027-03-01', 1)).toBe(2027)
  })
})

describe('nominees and ballots', () => {
  it('prefers the published sheet, falls back to appearances, drops hidden players', () => {
    expect(nomineesFor({ sheetPlayerIds: [3, 1, 2], appearancePlayerIds: [9] })).toEqual([1, 2, 3])
    expect(nomineesFor({ sheetPlayerIds: [], appearancePlayerIds: [9, 8, 8] })).toEqual([8, 9])
    expect(nomineesFor({ sheetPlayerIds: null, appearancePlayerIds: [1, 2, 3], hiddenIds: new Set([2]) })).toEqual([1, 3])
    expect(nomineesFor({ sheetPlayerIds: null, appearancePlayerIds: null })).toEqual([])
    expect(canVote(2, [1, 2])).toBe(true)
    expect(canVote(5, [1, 2])).toBe(false)
  })
  const nominees = [1, 2, 3, 4, 5]
  const picks = (...ids: number[]) => ids.map((playerId, i) => ({ place: i + 1, playerId }))
  it('accepts a full valid ballot sorted by place', () => {
    const r = validateBallot([{ place: 2, playerId: 3 }, { place: 1, playerId: 2 }, { place: 3, playerId: 4 }], nominees, 3, 1, false)
    expect(r).toEqual({ ok: true, picks: picks(2, 3, 4) })
  })
  it('refuses duplicates, self votes, non nominees, missing places and bad places', () => {
    const code = (p: ReturnType<typeof picks>, voter: number | null = 1, self = false, n = nominees, k = 3) => {
      const r = validateBallot(p, n, k, voter, self)
      return r.ok ? 'ok' : r.code
    }
    expect(code(picks(2, 2, 3))).toBe('duplicate')
    expect(code(picks(1, 2, 3))).toBe('self')
    expect(code(picks(1, 2, 3), 1, true)).toBe('ok')
    expect(code(picks(2, 3, 99))).toBe('not_nominee')
    expect(code(picks(2, 3))).toBe('missing')
    expect(code([{ place: 1, playerId: 2 }, { place: 1, playerId: 3 }, { place: 3, playerId: 4 }])).toBe('bad_input')
    expect(code([{ place: 4, playerId: 2 }, { place: 2, playerId: 3 }, { place: 3, playerId: 4 }])).toBe('bad_input')
    expect(code([], 1, false, [])).toBe('no_nominees')
  })
  it('asks for fewer places when there are fewer people to pick', () => {
    expect(validateBallot(picks(2, 3), [1, 2, 3], 3, 1, false).ok).toBe(true)
    expect(validateBallot(picks(2), [1, 2, 3], 3, 1, false).ok).toBe(false)
  })
  it('reads place fields from a form and labels votes', () => {
    const form: Record<string, unknown> = { place_1: '4', place_2: '', place_3: '9' }
    expect(picksFromForm((n) => form[n], 3)).toEqual([{ place: 1, playerId: 4 }, { place: 3, playerId: 9 }])
    expect(picksFromForm((n) => (n === 'place_1' ? '4x' : ''), 3)).toBeNull()
    expect(voteWord(1)).toBe('1 vote')
    expect(voteWord(3)).toBe('3 votes')
  })
})

// A season of three weekends, three grades of voters. Ballots carry places only.
const players = new Map<number, PlayerInfo>([
  [1, { name: 'Ann Alpha', sortName: 'alpha ann' }],
  [2, { name: 'Bo Beta', sortName: 'beta bo' }],
  [3, { name: 'Cy Gamma', sortName: 'gamma cy' }],
  [4, { name: 'Di Delta', sortName: 'delta di' }],
])
const fixture = (id: number, round: string, o: Partial<TallyFixture> = {}): TallyFixture => ({ id, round, gradeId: 'g1', counting: true, closed: true, nominees: [1, 2, 3, 4], ...o })
const ballot = (fixtureId: number, first: number, second: number, third: number): TallyBallot => ({ fixtureId, picks: [{ place: 1, playerId: first }, { place: 2, playerId: second }, { place: 3, playerId: third }] })
const many = (fixtureId: number, n: number, b: [number, number, number]) => Array.from({ length: n }, () => ballot(fixtureId, ...b))
const base = { values: [3, 2, 1], minBallots: 5, tieBreakFewestGames: false, audience: 'private' as const, players }

describe('tally', () => {
  it('computes points from stored places with the current values', () => {
    const r = tally({ ...base, fixtures: [fixture(1, '2026-10-03')], ballots: many(1, 5, [1, 2, 3]) })
    expect(r.rows.map((x) => [x.name, x.points, x.counts, x.ballots, x.games, x.rank])).toEqual([
      ['Ann Alpha', 15, [5, 0, 0], 5, 1, 1],
      ['Bo Beta', 10, [0, 5, 0], 5, 1, 2],
      ['Cy Gamma', 5, [0, 0, 5], 5, 1, 3],
    ])
    const custom = tally({ ...base, values: [5, 3, 1], fixtures: [fixture(1, '2026-10-03')], ballots: many(1, 5, [1, 2, 3]) })
    expect(custom.rows.map((x) => x.points)).toEqual([25, 15, 5])
  })
  it('hides a game under the minimum and says so; an excluded game never counts', () => {
    const r = tally({ ...base, fixtures: [fixture(1, '2026-10-03'), fixture(2, '2026-10-10'), fixture(3, '2026-10-17', { counting: false })], ballots: [...many(1, 5, [1, 2, 3]), ...many(2, 4, [4, 3, 2]), ...many(3, 6, [4, 3, 2])] })
    expect(r.countedGames).toBe(1)
    expect(r.uncountedGames).toBe(1)
    expect(r.rows.find((x) => x.playerId === 4)).toBeUndefined()
  })
  it('countback breaks equal points on the most top-place votes', () => {
    // Ann has one first (3 points). Bo has one second and one third (2 + 1 = 3 points).
    const one = (place: number, playerId: number): TallyBallot => ({ fixtureId: 1, picks: [{ place, playerId }] })
    const r = tally({ ...base, minBallots: 3, fixtures: [fixture(1, '2026-10-03')], ballots: [one(1, 1), one(2, 2), one(3, 2)] })
    expect(r.rows.map((x) => [x.name, x.points, x.rank, x.shared])).toEqual([['Ann Alpha', 3, 1, false], ['Bo Beta', 3, 2, false]])
  })
  it('equal in every respect is shared and ordered by name for display', () => {
    const one = (place: number, playerId: number): TallyBallot => ({ fixtureId: 1, picks: [{ place, playerId }] })
    const r = tally({ ...base, minBallots: 3, fixtures: [fixture(1, '2026-10-03')], ballots: [one(1, 2), one(1, 1), one(1, 2), one(1, 1), one(2, 3)] })
    const top = r.rows.filter((x) => x.rank === 1)
    expect(top.map((x) => x.name)).toEqual(['Ann Alpha', 'Bo Beta'])
    expect(top.every((x) => x.shared)).toBe(true)
    expect(r.rows.find((x) => x.playerId === 3)!.rank).toBe(3)
  })
  it('fewest-games toggle ranks fewer games higher on equal points and countback, and only when on', () => {
    const fixtures = [fixture(1, '2026-10-03', { nominees: [1] }), fixture(2, '2026-10-10', { nominees: [1, 2] })]
    const one = (fixtureId: number, playerId: number): TallyBallot => ({ fixtureId, picks: [{ place: 1, playerId }] })
    const ballots = [one(1, 1), one(1, 1), one(1, 1), one(2, 2), one(2, 2), one(2, 2)]
    const off = tally({ ...base, minBallots: 3, fixtures, ballots })
    expect(off.rows.map((x) => [x.playerId, x.rank, x.games])).toEqual([[1, 1, 2], [2, 1, 1]])
    const on = tally({ ...base, minBallots: 3, tieBreakFewestGames: true, fixtures, ballots })
    expect(on.rows.map((x) => [x.playerId, x.rank])).toEqual([[2, 1], [1, 2]])
  })
  it('grade scope: the caller filters fixtures and only their ballots count', () => {
    const r = tally({ ...base, fixtures: [fixture(1, '2026-10-03', { gradeId: 'a' })], ballots: [...many(1, 5, [1, 2, 3]), ...many(2, 9, [4, 3, 2])] })
    expect(r.rows.find((x) => x.playerId === 4)).toBeUndefined()
  })
  it('movement compares with the board before the last round, including a new entrant', () => {
    const fixtures = [fixture(1, '2026-10-03'), fixture(2, '2026-10-10')]
    const ballots = [...many(1, 5, [1, 2, 3]), ...many(2, 5, [4, 2, 1])]
    const r = tally({ ...base, fixtures, ballots })
    expect(r.rounds).toEqual(['2026-10-03', '2026-10-10'])
    expect(r.boards[0].rows.every((x) => x.movement === null)).toBe(true)
    // After round 2: Ann 20 (countback beats Bo), Bo 20, Di 15, Cy 5.
    expect(r.rows.map((x) => [x.playerId, x.rank])).toEqual([[1, 1], [2, 2], [4, 3], [3, 4]])
    const by = (id: number) => r.rows.find((x) => x.playerId === id)!.movement
    expect(by(1)).toEqual({ kind: 'same', by: 0 })
    expect(by(4)).toEqual({ kind: 'new', by: 0 })
    expect(by(3)).toEqual({ kind: 'down', by: 1 })
  })
})

describe('public eligibility and the differencing test', () => {
  const fixtures = [fixture(1, '2026-10-03'), fixture(2, '2026-10-10', { closed: false })]
  const closedBallots = many(1, 5, [1, 2, 3])
  const pub = (ballots: TallyBallot[]) => tally({ ...base, audience: 'public', fixtures, ballots })
  it('a game with an open window contributes nothing to any public total, and public output does not move when a ballot is cast in it', () => {
    const before = pub(closedBallots)
    const after = pub([...closedBallots, ...many(2, 6, [4, 3, 2])])
    expect(JSON.stringify(after)).toEqual(JSON.stringify(before))
    expect(after.rows.find((x) => x.playerId === 4)).toBeUndefined()
    expect(after.uncountedGames).toBe(1)
    const chart = buildRace(after.boards)
    expect(JSON.stringify(chart)).toEqual(JSON.stringify(buildRace(before.boards)))
  })
  it('the whole round is held while any game in it is open, whatever its ballot count', () => {
    const sameWeekend = [fixture(1, '2026-10-03'), fixture(2, '2026-10-03', { closed: false })]
    const r = tally({ ...base, audience: 'public', fixtures: sameWeekend, ballots: closedBallots })
    expect(r.rows).toEqual([])
    expect(r.uncountedGames).toBe(2)
  })
  it('private view shows the open game, clearly counted separately by the caller', () => {
    const r = tally({ ...base, fixtures, ballots: [...closedBallots, ...many(2, 6, [4, 3, 2])] })
    expect(r.rows.find((x) => x.playerId === 4)).toBeTruthy()
  })
})

describe('race chart, reveal steps and csv', () => {
  const fixtures = [fixture(1, '2026-10-03'), fixture(2, '2026-10-10'), fixture(3, '2026-10-17')]
  const ballots = [...many(1, 5, [1, 2, 3]), ...many(2, 5, [2, 1, 3]), ...many(3, 5, [1, 3, 2])]
  const r = tally({ ...base, fixtures, ballots })
  it('series are cumulative by round and carry no per-round points field', () => {
    const race = buildRace(r.boards)
    expect(race.rounds).toHaveLength(3)
    for (const s of race.series) {
      expect(Object.keys(s).sort()).toEqual(['name', 'playerId', 'points', 'rank', 'shared'])
      expect([...s.points].sort((a, b) => a - b)).toEqual(s.points)
    }
    expect(race.series.length).toBeLessThanOrEqual(6)
  })
  it('top five includes a tie at fifth up to six', () => {
    const many6 = new Map<number, PlayerInfo>(Array.from({ length: 8 }, (_, i) => [i + 1, { name: `P${i + 1}`, sortName: `p${i + 1}` }]))
    const f = [{ ...fixture(1, '2026-10-03'), nominees: [1, 2, 3, 4, 5, 6, 7, 8] }]
    const b: TallyBallot[] = [1, 2, 3, 4, 5, 6, 7].flatMap((p) => Array.from({ length: 3 }, () => ({ fixtureId: 1, picks: [{ place: 1, playerId: p }] })))
    const t = tally({ ...base, minBallots: 3, fixtures: f, ballots: b, players: many6 })
    expect(t.rows.every((x) => x.rank === 1)).toBe(true)
    expect(buildRace(t.boards).series).toHaveLength(6)
  })
  it('reveal steps: title, one per round, a countdown from fifth, then the winner; no per-game step', () => {
    const snap = buildSnapshot({ title: 'Awards', scopeLabel: 'Club', valuesLabel: '3-2-1', boards: r.boards, roundLabel: (k) => `Weekend ${k}` })
    const steps = buildRevealSteps(snap)
    expect(steps[0].kind).toBe('title')
    expect(steps.filter((s) => s.kind === 'round')).toHaveLength(3)
    expect(steps[steps.length - 1].kind).toBe('winner')
    expect(steps.every((s) => ['title', 'round', 'countdown', 'winner'].includes(s.kind))).toBe(true)
    const order = steps.filter((s) => s.kind === 'countdown').map((s) => (s.kind === 'countdown' ? s.row.rank : 0))
    expect([...order].sort((a, b) => b - a)).toEqual(order)
    expect(JSON.stringify(snap)).not.toMatch(/voterKey|picks/)
  })
  it('the csv holds season totals and neutralises a formula in a name', () => {
    const evil = new Map(players)
    evil.set(1, { name: '=HYPERLINK("http://x","y")', sortName: 'a' })
    const t = tally({ ...base, fixtures, ballots, players: evil })
    const csv = votesCsv(t.rows, [3, 2, 1], { scope: 'Club', season: '2026/27' })
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""y"")"`)
    expect(csv.split('\r\n')[0]).toContain('Ballot values used')
    expect(csv).toContain('3-2-1')
    expect(csv).not.toMatch(/voterKey/)
  })
})
