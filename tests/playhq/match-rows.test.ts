import { describe, expect, it } from 'vitest'
import oneDay from '../fixtures/playhq/game-summary-one-day.json'
import twoDay from '../fixtures/playhq/game-summary-two-day.json'
import forfeit from '../fixtures/playhq/game-summary-forfeit.json'
import wonForfeit from '../fixtures/playhq/game-summary-won-forfeit.json'
import abandoned from '../fixtures/playhq/game-summary-abandoned.json'
import { hashBundle, isSkip, mapMatchBundle, normaliseOutcome, stableStringify, type MatchBundle, type MatchCtx } from '@/lib/playhq/match-rows'
import type { RawGameSummary, RawPeriod } from '@/lib/playhq/types'
import { generateMatchSeed } from '../../payload/scripts/fixtures/match-seed-data'

const ORG = '484ced51-403a-466c-9a94-bd95eedf7319'
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const ctx = (raw: RawGameSummary, over: Partial<MatchCtx> = {}): MatchCtx => ({
  clubOrgId: ORG, clubIds: new Set(raw.teams.filter((t) => t.organisation?.id === ORG).map((t) => t.id)),
  seasonName: 'Summer 2025/26', seasonStartYear: 2025, competitionName: 'Seniors', isJunior: false, fixture: null, ...over,
})
const map = (raw: unknown, over: Partial<MatchCtx> = {}) => mapMatchBundle(raw as RawGameSummary, ctx(raw as RawGameSummary, over))
const bundle = (raw: unknown, over: Partial<MatchCtx> = {}) => {
  const b = map(raw, over)
  if (isSkip(b)) throw new Error(`skipped: ${b.skip}`)
  return b
}
const one = bundle(oneDay.data)
const two = bundle(twoDay.data)

describe('mapMatchBundle on the real fixtures', () => {
  it('maps the one-day game: teams, toss, result, local date, flags', () => {
    expect(one.match).toMatchObject({
      gameId: oneDay.data.id, type: 'oneDay', days: 1, clubTeamName: 'Lang Lang One Day', opponentName: 'Clyde Cougars One Day Green',
      opponentOrgName: 'Clyde Cricket Club', isHome: false, tossChoice: 'bowl', clubWonToss: true, result: 'won', byForfeit: false,
      onFirstInnings: false, localDate: '2025-10-25', venueName: 'Clyde Recreation Reserve', seasonStartYear: 2025, roundAbbr: 'R1',
    })
    expect(one.innings.map((i) => [i.sequenceNo, i.isClubBatting, i.played])).toEqual([[1, false, true], [2, true, true]])
    expect(one.warnings).toEqual([])
  })

  it('maps the two-day game with four innings and a first-innings result', () => {
    expect(two.match).toMatchObject({ type: 'twoDay', days: 2, result: 'lost', onFirstInnings: true, clubWonToss: true })
    expect(two.innings).toHaveLength(4)
    const [i1, i2] = two.innings
    expect(i1).toMatchObject({ declared: true, totalRuns: 237, totalWickets: 4, totalBalls: 342, hasFallOfWickets: true, hasBowlingData: true, hasBallData: true })
    expect(i2).toMatchObject({ allOut: true, totalRuns: 83, totalWickets: 10, extrasTotal: 6 })
  })

  it('the placeholder second innings is not played', () => {
    expect(two.innings.slice(2).map((i) => i.played)).toEqual([false, false])
  })

  it('totalBalls converts cricket notation (21.1 overs is 127 balls, not 211)', () => {
    expect(one.innings[0].totalBalls).toBe(21 * 6 + 1)
  })

  it('fall of wickets is joined to batting rows where it exists and absent where it does not', () => {
    expect(one.innings[0].hasFallOfWickets).toBe(false)
    expect(one.batting.filter((b) => b.inningsSeq === 1).every((b) => b.fowWicket === null && b.fowRuns === null)).toBe(true)
    expect(one.innings[1].hasFallOfWickets).toBe(true)
    const fow = two.batting.filter((b) => b.inningsSeq === 1 && b.fowWicket !== null)
    expect(fow.map((b) => b.fowWicket).sort()).toEqual([1, 2, 3, 4].slice(0, fow.length))
    expect(fow[0].fowRuns).toBeGreaterThan(0)
  })

  it('the one-day innings with empty statistics has no bowling data and no ball data: balls, fours, sixes are null, never 0', () => {
    expect(one.innings[1]).toMatchObject({ hasBowlingData: false, hasBallData: false })
    expect(one.innings[0]).toMatchObject({ hasBowlingData: true, hasBallData: false })
    const rows = one.batting.filter((b) => b.battingStatus !== 'did_not_bat')
    expect(rows.length).toBeGreaterThan(10)
    for (const r of rows) expect([r.balls, r.fours, r.sixes]).toEqual([null, null, null])
    expect(one.bowling.filter((b) => b.inningsSeq === 2)).toEqual([])
    const full = two.batting.find((b) => b.inningsSeq === 1 && b.battingStatus === 'out')!
    expect(full.balls).toBeGreaterThan(0)
  })

  it('did-not-bat rows are stored, including a null status with no statistics', () => {
    const raw = clone(twoDay.data) as never as RawGameSummary
    const batting = raw.periods[1].teams.find((t) => t.discipline === 'BATTING')!.appearances
    const nullNoStats = batting.filter((a) => a.status === null && a.statistics.length === 0)
    expect(nullNoStats.length).toBeGreaterThan(0)
    for (const a of nullNoStats) expect(two.batting.find((b) => b.inningsSeq === 2 && b.appearanceId === a.id)?.battingStatus).toBe('did_not_bat')
    const unknown = clone(raw)
    unknown.periods[1].teams.find((t) => t.discipline === 'BATTING')!.appearances[0].status = null
    const row = bundle(unknown).batting.find((b) => b.inningsSeq === 2 && b.appearanceId === unknown.periods[1].teams.find((t) => t.discipline === 'BATTING')!.appearances[0].id)!
    expect(row.battingStatus).toBe('unknown')
  })

  it('stores fielding rows for appearances PlayHQ lists with a fielding statistic, bowled or not', () => {
    expect(two.fielding.length).toBeGreaterThan(0)
    const bowlers = new Set(two.bowling.map((b) => `${b.inningsSeq}|${b.appearanceId}`))
    expect(two.fielding.some((f) => !bowlers.has(`${f.inningsSeq}|${f.appearanceId}`))).toBe(true)
  })

  it('opposition people are stored as display names, club people only as name keys', () => {
    const club = two.appearances.filter((a) => a.isClubSide)
    const opp = two.appearances.filter((a) => !a.isClubSide)
    expect(club.length).toBeGreaterThan(5)
    for (const a of club) expect([!!a.nameKey, a.displayName]).toEqual([true, null])
    for (const a of opp) expect([a.nameKey, !!a.displayName]).toEqual([null, true])
    expect(club.find((a) => a.nameKey === 'russell|savige')).toMatchObject({ isFillIn: true })
  })
})

describe('captured real shapes: forfeits and an abandoned game', () => {
  it('a FINAL game lost by forfeit is stored with byForfeit, no played innings and only opposition appearances', () => {
    const b = bundle(forfeit.data)
    expect(b.match).toMatchObject({ result: 'lost', byForfeit: true, clubOutcome: 'LOST_BY_FORFEIT', opponentOutcome: 'WON_BY_FORFEIT', clubWonToss: null, tossChoice: null })
    expect(b.innings.map((i) => i.played)).toEqual([false, false])
    expect(b.batting).toEqual([])
    expect(b.appearances.length).toBeGreaterThan(0)
    expect(b.appearances.every((a) => !a.isClubSide)).toBe(true)
  })
  it('a FINAL game won by forfeit keeps the club appearances (each counts as a game, as the season aggregate does)', () => {
    const b = bundle(wonForfeit.data)
    expect(b.match).toMatchObject({ result: 'won', byForfeit: true })
    expect(b.appearances.filter((a) => a.isClubSide)).toHaveLength(12)
  })
  it('an ABANDONED game is skipped as not_final', () => {
    expect(map(abandoned.data)).toEqual({ skip: 'not_final' })
  })
})

describe('dismissals', () => {
  const synthetic = (type: string, apps: { id: string; role: 'BATTING' | 'BOWLING' | 'FIELDING' }[], status = 'OUT') => {
    const raw = clone(twoDay.data) as never as RawGameSummary
    const p = raw.periods[0]
    const bat = p.teams.find((t) => t.discipline === 'BATTING')!
    const bowl = p.teams.find((t) => t.discipline === 'BOWLING')!
    const batter = bat.appearances.find((a) => a.status === 'OUT')!
    batter.status = status
    const [b1, b2] = bowl.appearances.map((a) => a.id)
    const filled = apps.map((a) => (a.role === 'BATTING' ? { ...a, id: batter.id } : { ...a, id: a.role === 'BOWLING' ? b1 : a.id === 'same' ? b1 : b2 }))
    p.sharedStatistics = [{ type, appearances: filled }]
    return { out: bundle(raw), batter: batter.id, b1, b2 }
  }
  it.each([
    ['BOWLED', 'bowled'], ['LEG_BEFORE_WICKET', 'lbw'], ['HIT_WICKET', 'hit_wicket'], ['STUMPED', 'stumped'],
  ])('%s maps to %s with the bowler and fielder appearance ids', (type, expected) => {
    const { out, batter, b1, b2 } = synthetic(type, [{ id: 'x', role: 'BATTING' }, { id: 'x', role: 'BOWLING' }, { id: 'f', role: 'FIELDING' }])
    const row = out.batting.find((b) => b.inningsSeq === 1 && b.appearanceId === batter)!
    expect(row).toMatchObject({ dismissalType: expected, bowlerAppearanceId: b1, fielderAppearanceId: b2 })
  })
  it('CAUGHT with the bowler as fielder is caught_and_bowled', () => {
    const { out, batter, b1 } = synthetic('CAUGHT', [{ id: 'x', role: 'BATTING' }, { id: 'x', role: 'BOWLING' }, { id: 'same', role: 'FIELDING' }])
    expect(out.batting.find((b) => b.appearanceId === batter && b.inningsSeq === 1)).toMatchObject({ dismissalType: 'caught_and_bowled', bowlerAppearanceId: b1, fielderAppearanceId: b1 })
  })
  it('RUN_OUT with two fielders stores only the first', () => {
    const raw = clone(twoDay.data) as never as RawGameSummary
    const p = raw.periods[0]
    const batter = p.teams.find((t) => t.discipline === 'BATTING')!.appearances.find((a) => a.status === 'OUT')!
    const [f1, f2] = p.teams.find((t) => t.discipline === 'BOWLING')!.appearances.map((a) => a.id)
    p.sharedStatistics = [{ type: 'RUN_OUT', appearances: [{ id: batter.id, role: 'BATTING' }, { id: f1, role: 'FIELDING' }, { id: f2, role: 'FIELDING' }] }]
    const row = bundle(raw).batting.find((b) => b.appearanceId === batter.id && b.inningsSeq === 1)!
    expect(row).toMatchObject({ dismissalType: 'run_out', fielderAppearanceId: f1, bowlerAppearanceId: null })
  })
  it.each(['RETIRED_HURT', 'RETIRED', 'RETIRED_OUT'])('%s is recognised', (type) => {
    const { out, batter } = synthetic(type, [{ id: 'x', role: 'BATTING' }])
    expect(out.batting.find((b) => b.appearanceId === batter && b.inningsSeq === 1)?.dismissalType).toBe(type.toLowerCase())
    expect(out.warnings).toEqual([])
  })
  it('an unknown dismissal type is stored as other and reported, never thrown', () => {
    const { out, batter } = synthetic('TIMED_OUT', [{ id: 'x', role: 'BATTING' }])
    expect(out.batting.find((b) => b.appearanceId === batter && b.inningsSeq === 1)?.dismissalType).toBe('other')
    expect(out.warnings).toContain('unknown_dismissal:TIMED_OUT')
  })
  it('the seed games cover every dismissal type the mapper knows', () => {
    const seen = new Set(generateMatchSeed(ORG).flatMap((g) => g.raw.periods.flatMap((p) => p.sharedStatistics.map((e) => e.type))))
    for (const t of ['BOWLED', 'CAUGHT', 'LEG_BEFORE_WICKET', 'STUMPED', 'RUN_OUT', 'HIT_WICKET', 'RETIRED_HURT']) expect(seen.has(t)).toBe(true)
    const types = new Set(generateMatchSeed(ORG).flatMap((g) => { const b = map(g.raw); return isSkip(b) ? [] : b.batting.map((r) => r.dismissalType) }))
    expect(types.has('caught_and_bowled')).toBe(true)
  })
})

describe('visibility, skips and tolerance', () => {
  it('drops invisible players and coaches', () => {
    const raw = clone(twoDay.data) as never as RawGameSummary
    const victim = raw.appearances.find((a) => a.teamId === bundle(raw).match.clubTeamId && a.roleType === 'Player')!
    victim.visible = false
    raw.appearances.push({ ...victim, id: 'coach-1', roleType: 'Coach', visible: true })
    const b = bundle(raw)
    expect(b.appearances.some((a) => a.appearanceId === victim.id || a.appearanceId === 'coach-1')).toBe(false)
    expect(b.batting.some((r) => r.appearanceId === victim.id)).toBe(false)
    expect(b.appearances).toHaveLength(two.appearances.length - 1)
  })
  it('skips junior, club-versus-club, non-final and no-club games', () => {
    expect(map(oneDay.data, { isJunior: true })).toEqual({ skip: 'junior' })
    expect(map(oneDay.data, { clubOrgId: 'someone-else' })).toEqual({ skip: 'no_club_side' })
    const derby = clone(oneDay.data) as never as RawGameSummary
    derby.teams[0].organisation.id = ORG
    expect(map(derby)).toEqual({ skip: 'club_vs_club' })
    expect(map({ ...clone(oneDay.data), status: 'LIVE' })).toEqual({ skip: 'not_final' })
  })
  it('tolerates empty periods, a period with one discipline, a period with no teams and no coin toss', () => {
    const raw = clone(oneDay.data) as never as RawGameSummary
    const bat = raw.periods[0].teams.find((t) => t.discipline === 'BATTING')!
    raw.periods = [
      { ...raw.periods[0], teams: [bat] } as RawPeriod,
      { id: 'x', name: 'SECOND_INNINGS', sequenceNo: 3, teams: [], sharedStatistics: [] },
      { id: 'y', name: 'SECOND_INNINGS', sequenceNo: 4, teams: [raw.periods[1].teams[0]], sharedStatistics: undefined as never },
    ]
    raw.coinToss = null
    const b = bundle(raw)
    expect(b.innings.map((i) => i.sequenceNo)).toEqual([1, 4])
    expect(b.innings[0].bowlingTeamId).not.toBeNull()
    expect(b.match).toMatchObject({ clubWonToss: null, tossChoice: null })
    expect(bundle({ ...clone(oneDay.data), periods: [] }).innings).toEqual([])
  })
  it('normalises every outcome string and reports an unknown one', () => {
    expect(normaliseOutcome('WON_BY_FORFEIT')).toMatchObject({ result: 'won', byForfeit: true })
    expect(normaliseOutcome('LOST_ON_FIRST_INNINGS')).toMatchObject({ result: 'lost', onFirstInnings: true })
    for (const [o, r] of [['DRAW', 'draw'], ['DREW', 'draw'], ['TIE', 'tie'], ['TIED', 'tie'], ['NO_RESULT', 'no_result'], ['ABANDONED', 'abandoned']] as const) expect(normaliseOutcome(o).result).toBe(r)
    expect(normaliseOutcome(null)).toMatchObject({ result: null, known: true })
    const raw = clone(oneDay.data) as never as RawGameSummary
    raw.teams.find((t) => t.organisation.id === ORG)!.outcome = 'SUSPENDED'
    const b = bundle(raw)
    expect(b.match.result).toBeNull()
    expect(b.warnings).toContain('unknown_outcome:SUSPENDED')
  })
  it('uses the venue timezone for the local date', () => {
    const raw = clone(oneDay.data) as never as RawGameSummary
    raw.schedule[0].dateTime = '2025-10-25T20:30:00.000Z'
    expect(bundle(raw).match.localDate).toBe('2025-10-26')
    raw.playingSurfaces[0].venue.timezone = 'Australia/Perth'
    expect(bundle(raw).match.localDate).toBe('2025-10-26')
    raw.playingSurfaces[0].venue.timezone = 'America/Los_Angeles'
    expect(bundle(raw).match.localDate).toBe('2025-10-25')
  })
  it('takes updatedAt and the suburb from the fixture', () => {
    const b = bundle(oneDay.data, { fixture: { updatedAt: '2025-10-26T01:00:00.000Z', venueSuburb: 'CLYDE', localDate: '2025-10-25', gradeId: null, gradeName: null, roundName: null, roundAbbr: null, isFinalRound: false } })
    expect(b.match).toMatchObject({ playhqUpdatedAt: '2025-10-26T01:00:00.000Z', venueSuburb: 'CLYDE' })
  })
})

describe('sourceHash', () => {
  it('is stable across key order and across playhqUpdatedAt, and changes when a run changes', () => {
    const a = bundle(oneDay.data)
    const reordered = clone(oneDay.data) as never as RawGameSummary
    reordered.teams = reordered.teams.map((t) => Object.fromEntries(Object.entries(t).reverse()) as never)
    expect(bundle(reordered).sourceHash).toBe(a.sourceHash)
    const later = bundle(oneDay.data, { fixture: { updatedAt: 'later', venueSuburb: null, localDate: null, gradeId: null, gradeName: null, roundName: null, roundAbbr: null, isFinalRound: false } })
    expect(later.sourceHash).toBe(a.sourceHash)
    const changed = clone(oneDay.data) as never as RawGameSummary
    changed.periods[0].teams.find((t) => t.discipline === 'BATTING')!.appearances[0].statistics[0].value += 1
    expect(bundle(changed).sourceHash).not.toBe(a.sourceHash)
    expect(hashBundle(a as MatchBundle)).toBe(a.sourceHash)
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}')
  })
})

describe('the seed games', () => {
  const games = generateMatchSeed(ORG)
  it('is deterministic and about 25 games over two seasons', () => {
    expect(JSON.stringify(generateMatchSeed(ORG))).toBe(JSON.stringify(games))
    expect(games.length).toBeGreaterThanOrEqual(24)
    expect(new Set(games.map((g) => g.seasonName)).size).toBe(2)
  })
  it('maps every game (only the ABANDONED one is skipped) and covers the edge cases', () => {
    const skipped = games.filter((g) => isSkip(map(g.raw)))
    expect(skipped.map((g) => g.raw.status)).toEqual(['ABANDONED'])
    const bundles = games.map((g) => map(g.raw)).filter((b): b is MatchBundle => !isSkip(b))
    expect(bundles.some((b) => b.match.byForfeit && b.match.result === 'lost')).toBe(true)
    expect(bundles.some((b) => b.match.byForfeit && b.match.result === 'won')).toBe(true)
    expect(bundles.some((b) => b.match.result === 'no_result' && b.innings.every((i) => !i.played))).toBe(true)
    expect(bundles.some((b) => b.innings.some((i) => i.declared))).toBe(true)
    expect(bundles.some((b) => b.innings.some((i) => i.allOut))).toBe(true)
    expect(bundles.some((b) => b.innings.some((i) => i.played && !i.hasFallOfWickets))).toBe(true)
    expect(bundles.some((b) => b.innings.some((i) => i.played && !i.hasBowlingData))).toBe(true)
    expect(bundles.some((b) => b.innings.some((i) => i.sequenceNo > 2 && !i.played))).toBe(true)
    expect(bundles.some((b) => b.appearances.some((a) => a.isFillIn))).toBe(true)
    expect(bundles.some((b) => b.batting.some((r) => r.battingStatus === 'did_not_bat'))).toBe(true)
    expect(bundles.some((b) => b.batting.some((r) => r.dismissalType === 'retired_hurt'))).toBe(true)
  })
  it('invents every person: no seed name appears in the real fixtures', () => {
    const real = new Set([oneDay, twoDay].flatMap((f) => f.data.appearances.map((a) => `${a.firstName}|${a.lastName}`.toLowerCase())))
    expect(real.size).toBeGreaterThan(30)
    for (const g of games) for (const a of g.raw.appearances) expect(real.has(`${a.firstName}|${a.lastName}`.toLowerCase())).toBe(false)
  })
})
