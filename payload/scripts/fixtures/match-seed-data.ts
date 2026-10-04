/**
 * Deterministic per-match seed (WP-M, spec M9): about 25 synthesised PlayHQ game summaries over two
 * seasons for 14 invented club players and invented opponents, so the real mapper
 * (`mapMatchBundle`) is exercised and no real person's name is added to any database. Pure: no
 * Payload or database imports, so the seed script and the unit and int tests share one generator.
 *
 * It is written from the same assumptions as the mapper, so it cannot prove a shape is right. The
 * real captured summaries under `tests/fixtures/playhq/` do that. Shapes PlayHQ has not been seen
 * to return (RUN_OUT, STUMPED, RETIRED_HURT, HIT_WICKET events) are synthetic here.
 *
 * Edge cases covered: declared innings, all out, two-day with a placeholder third innings, did not
 * bat (with a null-status row), run out, stumped, retired hurt, caught-and-bowled, a lost and a won
 * forfeit, an abandoned game (status ABANDONED, so the mapper skips it) and a no-result FINAL game,
 * an innings with no fall of wickets, an innings with no bowling or ball data, a fill-in, a hidden
 * club player, a player with two aliases and a same-name pair in one game.
 */
import type { RawAppearance, RawGameSummary, RawPeriod, RawPeriodAppearance, RawPeriodTeam, RawStat } from '../../../lib/playhq/types'
import { ballsToOvers } from '../../../lib/playhq/players'

export const MATCH_SEED_SEASONS = [
  { name: 'Summer 2024/25', startYear: 2024, competitionName: 'Seed Senior Competition' },
  { name: 'Summer 2025/26', startYear: 2025, competitionName: 'Seed Senior Competition' },
] as const

export type SeedGame = {
  raw: RawGameSummary
  seasonName: string
  seasonStartYear: number
  competitionName: string
  fixture: NonNullable<import('../../../lib/playhq/match-rows').MatchCtx['fixture']>
  /** Tag for tests and docs: which edge case this game exercises. */
  edge: string | null
}

const uuid = (kind: number, n: number) => `${String(kind).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Person = { firstName: string; lastName: string }

/** 14 invented club players. `hidden` is a site-level flag set on the players table by the seed. */
export const MATCH_SEED_CLUB_PLAYERS: Person[] = [
  { firstName: 'Corey', lastName: 'Ashby' }, { firstName: 'Daniel', lastName: 'Whitlock' }, { firstName: 'Evan', lastName: 'Brennan' },
  { firstName: 'Felix', lastName: 'Okafor' }, { firstName: 'Gavin', lastName: 'Tolliver' }, { firstName: 'Hamish', lastName: 'Glover' },
  { firstName: 'Isaac', lastName: 'Mendel' }, { firstName: 'Jarrod', lastName: 'Quill' }, { firstName: 'Kieran', lastName: 'Nash-Bell' },
  { firstName: 'Lachie', lastName: 'Verrall' }, { firstName: 'Mitch', lastName: 'Dunstan' }, { firstName: 'Nathan', lastName: 'Orchard' },
  { firstName: 'Owen', lastName: 'Pritchard' }, { firstName: 'Sam', lastName: 'Pritchard' },
]
export const MATCH_SEED_HIDDEN_KEY = 'hamish|glover'
/** The seed registers this alias for Daniel Whitlock; PlayHQ lists him as "Dan" in the 2024/25 games. */
export const MATCH_SEED_ALIAS = { nameKey: 'dan|whitlock', canonicalKey: 'daniel|whitlock' }
export const MATCH_SEED_SAME_NAME = 'sam|pritchard'

const OPP_FIRST = ['Aaron', 'Blake', 'Cody', 'Drew', 'Elliot', 'Finn', 'Grant', 'Harvey', 'Ivan', 'Jed', 'Kyle', 'Liam', 'Marty', 'Neil', 'Oscar']
const OPP_LAST = ['Archer', 'Baxter', 'Calder', 'Dawson', 'Eastman', 'Fenwick', 'Gallo', 'Hartley', 'Irving', 'Jessop', 'Kemp', 'Lowe', 'Marsh', 'Norris', 'Oakes']
const OPP_CLUBS = ['Caldermeade Rovers', 'Bunyip Creek', 'Tynong North', 'Garfield Bandits', 'Koo Wee Rup Colts', 'Nyora Hawks']

const FILL_IN: Person = { firstName: 'Quentin', lastName: 'Fillin' }

type Roster = { teamId: string; orgId: string; teamName: string; orgName: string; apps: RawAppearance[]; coach: RawAppearance }

function makeRoster(kind: number, teamId: string, orgId: string, teamName: string, orgName: string, people: Person[], fillIn: boolean): Roster {
  const apps = people.map<RawAppearance>((p, i) => ({
    id: uuid(kind, i + 1), firstName: p.firstName, lastName: p.lastName, teamId,
    captainRole: i === 0 ? 'CAPTAIN' : null, playerNumber: null, isFillIn: fillIn && i === people.length - 1,
    isRegisteredPlayer: !(fillIn && i === people.length - 1), visible: true, roleType: 'Player', playerPosition: null,
  }))
  const coach: RawAppearance = {
    id: uuid(kind, 99), firstName: 'Coach', lastName: 'Person', teamId, captainRole: null, playerNumber: null,
    isFillIn: false, isRegisteredPlayer: true, visible: true, roleType: 'Coach', playerPosition: null,
  }
  return { teamId, orgId, teamName, orgName, apps, coach }
}

type InningsOpts = {
  seq: number; name: string; bat: Roster; bowl: Roster
  wickets?: number; declared?: boolean; fow?: boolean; bowlingData?: boolean; ballData?: boolean
  force?: string[]; retiredHurt?: boolean; oneDay?: boolean; target?: number
}

const stat = (type: string, value: number): RawStat => ({ type, value })
const round2 = (n: number) => Math.round(n * 100) / 100

function playInnings(rng: () => number, o: InningsOpts): RawPeriod {
  const bowlers = o.bowl.apps.slice(1, 6)
  const keeper = o.bowl.apps[0]
  let wk = o.wickets ?? 2 + Math.floor(rng() * 9)
  const batted = wk >= 10 ? 11 : wk + 2
  const rows: { app: RawAppearance; runs: number; balls: number; fours: number; sixes: number; status: 'OUT' | 'NOT_OUT' }[] = []
  for (let i = 0; i < batted; i++) {
    const mean = i < 5 ? 22 : 9
    const runs = Math.min(131, Math.floor(-Math.log(1 - rng()) * mean))
    const balls = runs === 0 ? 1 + Math.floor(rng() * 8) : Math.floor(runs * (0.8 + rng() * 0.9)) + 1
    const fours = Math.min(Math.floor(runs / 4), Math.floor(rng() * (runs / 6 + 1)))
    const sixes = Math.min(Math.floor((runs - fours * 4) / 6), Math.floor(rng() * 2))
    rows.push({ app: o.bat.apps[i], runs, balls, fours, sixes, status: wk >= 10 ? (i < 10 ? 'OUT' : 'NOT_OUT') : i < wk ? 'OUT' : 'NOT_OUT' })
  }
  if (o.target !== undefined) {
    // Chase: make the total exceed the target, trimming nothing: add runs to the not-out openers.
    const have = rows.reduce((s, r) => s + r.runs, 0)
    if (have < o.target) rows[rows.length - 1].runs += o.target - have
  }
  const types = [...(o.force ?? [])]
  const pick = () => {
    const u = rng() * 10.6
    return u < 3 ? 'BOWLED' : u < 7 ? 'CAUGHT' : u < 9 ? 'LEG_BEFORE_WICKET' : u < 9.5 ? 'STUMPED' : u < 10.5 ? 'RUN_OUT' : 'HIT_WICKET'
  }
  const events: RawPeriod['sharedStatistics'] = []
  const credit = new Map<string, number>()
  const fielding = new Map<string, Record<string, number>>()
  const bump = (id: string, k: string) => fielding.set(id, { ...(fielding.get(id) ?? {}), [k]: (fielding.get(id)?.[k] ?? 0) + 1 })
  const outRows = rows.filter((r) => r.status === 'OUT')
  for (const [i, r] of outRows.entries()) {
    const type = types[i] ?? pick()
    const bowler = bowlers[Math.floor(rng() * bowlers.length)]
    const others = o.bowl.apps.filter((a) => a.id !== bowler.id)
    const fielder = others[Math.floor(rng() * others.length)]
    const apps: { id: string; role: 'BATTING' | 'BOWLING' | 'FIELDING' }[] = [{ id: r.app.id, role: 'BATTING' }]
    if (type === 'RUN_OUT') {
      apps.push({ id: fielder.id, role: 'FIELDING' })
      bump(fielder.id, 'RUN_OUTS_UNASSISTED')
    } else {
      apps.push({ id: bowler.id, role: 'BOWLING' })
      credit.set(bowler.id, (credit.get(bowler.id) ?? 0) + 1)
      if (type === 'CAUGHT') {
        const caughtBehind = rng() < 0.2
        const f = rng() < 0.18 ? bowler : caughtBehind ? keeper : fielder
        apps.push({ id: f.id, role: 'FIELDING' })
        bump(f.id, f === keeper && f !== bowler ? 'CATCHES_AS_WICKET_KEEPER' : 'CATCHES_AS_FIELDER')
      } else if (type === 'STUMPED') {
        apps.push({ id: keeper.id, role: 'FIELDING' })
        bump(keeper.id, 'STUMPINGS')
      }
    }
    events.push({ type, appearances: apps })
  }
  if (o.retiredHurt && outRows.length) {
    // The last "out" batter actually retired hurt: not a wicket.
    const last = outRows[outRows.length - 1]
    events.pop()
    last.status = 'NOT_OUT'
    events.push({ type: 'RETIRED_HURT', appearances: [{ id: last.app.id, role: 'BATTING' }] })
    wk -= 1
  }
  const extras = { wides: Math.floor(rng() * 8), noBalls: Math.floor(rng() * 4), byes: Math.floor(rng() * 4), legByes: Math.floor(rng() * 4), penalty: 0 }
  const extrasTotal = extras.wides + extras.noBalls + extras.byes + extras.legByes
  const batRuns = rows.reduce((s, r) => s + r.runs, 0)
  const total = batRuns + extrasTotal
  const bowled = Math.max(12, rows.reduce((s, r) => s + r.balls, 0) + extras.byes + extras.legByes)
  const ballsBowled = o.oneDay ? Math.min(bowled, 210) : bowled

  // Bowling split: five bowlers share the legal balls and the runs charged to bowlers.
  const weights = bowlers.map(() => 0.5 + rng())
  const wsum = weights.reduce((a, b) => a + b, 0)
  let ballsLeft = ballsBowled, runsLeft = total - extras.byes - extras.legByes - extras.penalty
  const bowlingApps: RawPeriodAppearance[] = o.bowl.apps.map((a) => ({ id: a.id, displayOrder: 0, status: null, statistics: [] as RawStat[] }))
  bowlers.forEach((b, i) => {
    const last = i === bowlers.length - 1
    const balls = last ? ballsLeft : Math.min(ballsLeft, Math.round((ballsBowled * weights[i]) / wsum))
    const runs = last ? runsLeft : Math.min(runsLeft, Math.round((runsLeft * weights[i]) / wsum))
    ballsLeft -= balls
    runsLeft -= runs
    const target = bowlingApps.find((x) => x.id === b.id)!
    if (o.bowlingData === false) return
    target.displayOrder = i + 1
    target.statistics = [
      stat('OVERS', Number(ballsToOvers(balls))), stat('MAIDENS', Math.floor(rng() * (balls / 18 + 1))), stat('RUNS', runs),
      stat('WICKETS', credit.get(b.id) ?? 0), stat('WIDES', Math.floor(rng() * 3)), stat('NO_BALLS', Math.floor(rng() * 2)),
      stat('ECONOMY', balls ? round2(runs / (balls / 6)) : 0),
    ]
  })
  if (o.bowlingData !== false) {
    for (const a of bowlingApps) {
      const f = fielding.get(a.id)
      if (f) a.statistics.push(...Object.entries(f).map(([k, v]) => stat(k, v)))
    }
  }

  const withBalls = o.ballData !== false
  const battingApps: RawPeriodAppearance[] = o.bat.apps.map((a, i) => {
    const r = rows[i]
    if (!r) return { id: a.id, displayOrder: i + 1, status: 'DID_NOT_BAT', statistics: [] }
    const stats = [stat('TOTAL_RUNS', r.runs)]
    if (withBalls) stats.push(stat('BALLS_FACED', r.balls), stat('FOURS', r.fours), stat('SIXES', r.sixes), stat('STRIKE_RATE', r.balls ? round2((r.runs / r.balls) * 100) : 0))
    return { id: a.id, displayOrder: i + 1, status: r.status, statistics: stats }
  })
  const fow = o.fow === false ? null : (() => {
    let acc = 0
    const outs = rows.filter((r, i) => r.status === 'OUT' && events.some((e) => e.appearances.some((x) => x.id === o.bat.apps[i].id && x.role === 'BATTING')))
    return outs.map((r, k) => {
      acc = Math.min(total, acc + Math.max(1, Math.round(total / (outs.length + 1))))
      return { sequenceNo: k + 1, appearanceId: r.app.id, runs: acc }
    })
  })()
  const balls6 = ballsToOvers(ballsBowled)
  const batTeam: RawPeriodTeam = {
    id: o.bat.teamId, discipline: 'BATTING', status: wk >= 10 ? 'ALL_OUT' : o.declared ? 'DECLARED' : o.oneDay ? 'END_OF_GAME' : null,
    statistics: [
      stat('TOTAL_EXTRAS', extrasTotal), stat('EXTRA_WIDES', extras.wides), stat('EXTRA_NO_BALLS', extras.noBalls), stat('EXTRA_BYES', extras.byes),
      stat('EXTRA_LEG_BYES', extras.legByes), stat('EXTRA_PENALTY_RUNS', 0), stat('TOTALS', batRuns), stat('TOTAL_OUTS', wk), stat('TOTAL_SCORE', total),
      stat('TOTAL_OVERS', Number(balls6)), ...(o.oneDay ? [stat('OVER_LIMIT', 35)] : []),
    ],
    appearances: battingApps, fallOfWickets: fow && fow.length ? fow : null,
  }
  const bowlTeam: RawPeriodTeam = { id: o.bowl.teamId, discipline: 'BOWLING', status: null, statistics: [], appearances: bowlingApps, fallOfWickets: null }
  return { id: uuid(7, o.seq), name: o.name, sequenceNo: o.seq, teams: [bowlTeam, batTeam], sharedStatistics: events }
}

/** PlayHQ's placeholder for a two-day innings that never happened: 0 overs, 0 runs, two openers "not out 0". */
function placeholderInnings(seq: number, name: string, bat: Roster, bowl: Roster): RawPeriod {
  const apps: RawPeriodAppearance[] = bat.apps.map((a, i) => ({
    id: a.id, displayOrder: i + 1, status: i < 2 ? 'NOT_OUT' : i === 2 ? null : 'DID_NOT_BAT', statistics: i < 2 ? [stat('TOTAL_RUNS', 0)] : [],
  }))
  return {
    id: uuid(7, seq), name, sequenceNo: seq, sharedStatistics: [],
    teams: [
      { id: bowl.teamId, discipline: 'BOWLING', status: null, statistics: [], appearances: [], fallOfWickets: null },
      { id: bat.teamId, discipline: 'BATTING', status: null, statistics: [stat('TOTAL_OVERS', 0), stat('TOTAL_SCORE', 0), stat('TOTAL_OUTS', 0)], appearances: apps, fallOfWickets: null },
    ],
  }
}

function emptyPeriod(seq: number, name: string, bat: Roster, bowl: Roster): RawPeriod {
  return {
    id: uuid(7, seq), name, sequenceNo: seq, sharedStatistics: [],
    teams: [
      { id: bowl.teamId, discipline: 'BOWLING', status: null, statistics: [], appearances: [], fallOfWickets: null },
      { id: bat.teamId, discipline: 'BATTING', status: null, statistics: [], appearances: [], fallOfWickets: null },
    ],
  }
}

/** A forfeit or abandoned game: two empty periods, as in the captured real summaries. */
function emptyPeriods(a: Roster, b: Roster): RawPeriod[] {
  const side = (r: Roster, discipline: 'BATTING' | 'BOWLING'): RawPeriodTeam => ({
    id: r.teamId, discipline, status: null, statistics: discipline === 'BATTING' ? [stat('OVER_LIMIT', 35)] : [], appearances: [], fallOfWickets: null,
  })
  return [
    { id: uuid(7, 1), name: 'FIRST_INNINGS', sequenceNo: 1, sharedStatistics: [], teams: [side(b, 'BOWLING'), side(a, 'BATTING')] },
    { id: uuid(7, 2), name: 'FIRST_INNINGS', sequenceNo: 2, sharedStatistics: [], teams: [side(a, 'BOWLING'), side(b, 'BATTING')] },
  ]
}

type Spec = {
  season: 0 | 1; date: string; kind: 'oneDay' | 'twoDay'; opp: number; round: string; home?: boolean
  edge?: string; outcome?: [string, string]
  club?: number[]            // indexes into MATCH_SEED_CLUB_PLAYERS (11 expected)
  fillIn?: boolean; dan?: boolean; samePair?: boolean
  inn?: Partial<InningsOpts>[]; skipPlay?: 'forfeit_lost' | 'forfeit_won' | 'abandoned' | 'no_result'
  twoInnings?: boolean; toss?: 'bat' | 'bowl' | null
}

const ALL = MATCH_SEED_CLUB_PLAYERS.map((_, i) => i)
const squad = (skip: number) => ALL.filter((i) => i !== skip % 14).slice(0, 11)

const SPECS: Spec[] = [
  // 2024/25 (11 games)
  { season: 0, date: '2024-10-12', kind: 'oneDay', opp: 0, round: 'Round 1', club: squad(0), dan: true, outcome: ['WON', 'LOST'] },
  { season: 0, date: '2024-10-19', kind: 'twoDay', opp: 1, round: 'Round 2', club: squad(1), dan: true, outcome: ['LOST_ON_FIRST_INNINGS', 'WON_ON_FIRST_INNINGS'], twoInnings: true, edge: 'two-day, placeholder third innings' },
  { season: 0, date: '2024-10-26', kind: 'oneDay', opp: 2, round: 'Round 3', club: squad(2), dan: true, outcome: ['LOST', 'WON'], inn: [{ force: ['RUN_OUT', 'STUMPED'] }], edge: 'run out and stumped' },
  { season: 0, date: '2024-11-09', kind: 'twoDay', opp: 3, round: 'Round 4', club: squad(3), dan: true, outcome: ['WON', 'LOST'], edge: 'two-day, four innings, declared', inn: [{ declared: true, wickets: 6 }, {}, { wickets: 10, force: ['CAUGHT', 'CAUGHT', 'BOWLED'] }, { wickets: 4 }] },
  { season: 0, date: '2024-11-16', kind: 'oneDay', opp: 0, round: 'Round 5', club: squad(4), dan: true, skipPlay: 'forfeit_lost', outcome: ['LOST_BY_FORFEIT', 'WON_BY_FORFEIT'], edge: 'lost by forfeit' },
  { season: 0, date: '2024-11-23', kind: 'oneDay', opp: 4, round: 'Round 6', club: squad(5), samePair: true, outcome: ['WON', 'LOST'], edge: 'same-name pair' },
  { season: 0, date: '2024-12-07', kind: 'oneDay', opp: 5, round: 'Round 7', club: squad(6), outcome: ['WON', 'LOST'], inn: [{ wickets: 10 }, { retiredHurt: true }], edge: 'all out, retired hurt' },
  { season: 0, date: '2024-12-14', kind: 'oneDay', opp: 1, round: 'Round 8', club: squad(7), outcome: ['LOST', 'WON'], inn: [{ fow: false }, { bowlingData: false, ballData: false }], edge: 'no fall of wickets; no bowling or ball data' },
  { season: 0, date: '2025-01-11', kind: 'oneDay', opp: 2, round: 'Round 9', club: squad(8), fillIn: true, outcome: ['WON', 'LOST'], edge: 'fill-in' },
  { season: 0, date: '2025-01-18', kind: 'oneDay', opp: 3, round: 'Round 10', club: squad(9), skipPlay: 'abandoned', outcome: ['ABANDONED', 'ABANDONED'], edge: 'abandoned (status ABANDONED, skipped by the mapper)' },
  { season: 0, date: '2025-02-01', kind: 'twoDay', opp: 4, round: 'Semi Final', club: squad(10), outcome: ['WON', 'LOST'], twoInnings: false, inn: [{ declared: true, wickets: 5 }, { wickets: 10 }, {}, { target: 60 }] },
  // 2025/26 (14 games)
  { season: 1, date: '2025-10-11', kind: 'oneDay', opp: 5, round: 'Round 1', club: squad(11), outcome: ['WON', 'LOST'] },
  { season: 1, date: '2025-10-18', kind: 'twoDay', opp: 0, round: 'Round 2', club: squad(12), outcome: ['WON_ON_FIRST_INNINGS', 'LOST_ON_FIRST_INNINGS'], twoInnings: true },
  { season: 1, date: '2025-10-25', kind: 'oneDay', opp: 1, round: 'Round 3', club: squad(13), outcome: ['LOST', 'WON'], inn: [{ force: ['CAUGHT', 'CAUGHT', 'CAUGHT'] }] },
  { season: 1, date: '2025-11-01', kind: 'oneDay', opp: 2, round: 'Round 4', club: squad(0), skipPlay: 'forfeit_won', outcome: ['WON_BY_FORFEIT', 'LOST_BY_FORFEIT'], edge: 'won by forfeit' },
  { season: 1, date: '2025-11-08', kind: 'twoDay', opp: 3, round: 'Round 5', club: squad(1), outcome: ['DRAW', 'DRAW'], twoInnings: false, inn: [{ wickets: 8, declared: true }, { wickets: 7 }, { wickets: 3 }, { wickets: 6 }], edge: 'drawn two-day' },
  { season: 1, date: '2025-11-15', kind: 'oneDay', opp: 4, round: 'Round 6', club: squad(2), outcome: ['WON', 'LOST'], samePair: true, edge: 'same-name pair' },
  { season: 1, date: '2025-11-22', kind: 'oneDay', opp: 5, round: 'Round 7', club: squad(3), outcome: ['TIE', 'TIE'], edge: 'tie' },
  { season: 1, date: '2025-11-29', kind: 'oneDay', opp: 0, round: 'Round 8', club: squad(4), skipPlay: 'no_result', outcome: ['NO_RESULT', 'NO_RESULT'], edge: 'FINAL with no result and no play' },
  { season: 1, date: '2025-12-06', kind: 'oneDay', opp: 1, round: 'Round 9', club: squad(5), outcome: ['LOST', 'WON'], inn: [{ wickets: 10 }, { target: 40 }], fillIn: true },
  { season: 1, date: '2025-12-13', kind: 'twoDay', opp: 2, round: 'Round 10', club: squad(6), outcome: ['WON', 'LOST'], inn: [{ declared: true, wickets: 7 }, { wickets: 10 }, { wickets: 2 }, { wickets: 10 }] },
  { season: 1, date: '2026-01-10', kind: 'oneDay', opp: 3, round: 'Round 11', club: squad(7), outcome: ['WON', 'LOST'], inn: [{ force: ['STUMPED', 'RUN_OUT', 'HIT_WICKET'] }] },
  { season: 1, date: '2026-01-17', kind: 'oneDay', opp: 4, round: 'Round 12', club: squad(8), outcome: ['LOST', 'WON'] },
  { season: 1, date: '2026-01-31', kind: 'twoDay', opp: 5, round: 'Round 13', club: squad(9), outcome: ['LOST', 'WON'], inn: [{ wickets: 10 }, { declared: true, wickets: 4 }, { wickets: 9 }, { wickets: 10 }] },
  { season: 1, date: '2026-02-14', kind: 'twoDay', opp: 0, round: 'Grand Final', club: squad(10), outcome: ['WON', 'LOST'], twoInnings: true },
]

const GRADE = { id: uuid(5, 1), name: 'Seed A Grade' }

/**
 * The generated games. `clubOrgId` is the organisation id the mapper will treat as the club (the
 * PlayHQ org id from `config/site.ts`); club team ids are stable per season.
 */
export function generateMatchSeed(clubOrgId: string): SeedGame[] {
  const rng = mulberry32(20261004)
  const out: SeedGame[] = []
  const oppPeople = OPP_CLUBS.map((_, c) => Array.from({ length: 11 }, (__, i) => ({ firstName: OPP_FIRST[(c + i) % OPP_FIRST.length], lastName: OPP_LAST[(i * 3 + c) % OPP_LAST.length] })))
  SPECS.forEach((spec, idx) => {
    const season = MATCH_SEED_SEASONS[spec.season]
    const n = idx + 1
    const clubPeople: Person[] = (spec.club ?? squad(idx)).map((i) => {
      const p = MATCH_SEED_CLUB_PLAYERS[i]
      return spec.dan && p.firstName === 'Daniel' ? { firstName: 'Dan', lastName: p.lastName } : p
    })
    if (spec.fillIn) clubPeople[10] = FILL_IN
    if (spec.samePair) {
      const sam = MATCH_SEED_CLUB_PLAYERS[13]
      if (!clubPeople.some((p) => p.lastName === sam.lastName && p.firstName === sam.firstName)) clubPeople[9] = sam
      clubPeople[10] = { ...sam }
    }
    const club = makeRoster(100 + n, uuid(2, spec.season + 1), clubOrgId, 'Seed A Grade', 'Seed Club', clubPeople, !!spec.fillIn)
    const oppClub = OPP_CLUBS[spec.opp]
    const opp = makeRoster(200 + n, uuid(3, spec.opp + 1), uuid(4, spec.opp + 1), `${oppClub} A Grade`, oppClub, oppPeople[spec.opp], false)
    const home = spec.home ?? n % 2 === 0
    const [clubOutcome, oppOutcome] = spec.outcome ?? ['WON', 'LOST']

    const clubBatsFirst = rng() < 0.5
    const first = clubBatsFirst ? club : opp
    const second = clubBatsFirst ? opp : club
    let periods: RawPeriod[]
    let appearances: RawAppearance[] = [...club.apps, club.coach, ...opp.apps, opp.coach]
    if (spec.skipPlay === 'forfeit_lost') {
      periods = emptyPeriods(opp, club)
      appearances = [...opp.apps, opp.coach]
    } else if (spec.skipPlay === 'forfeit_won') {
      periods = emptyPeriods(club, opp)
      appearances = [...club.apps, club.coach]
    } else if (spec.skipPlay === 'abandoned' || spec.skipPlay === 'no_result') {
      periods = emptyPeriods(club, opp)
    } else if (spec.kind === 'oneDay') {
      const i0 = spec.inn?.[0] ?? {}, i1 = spec.inn?.[1] ?? {}
      const p1 = playInnings(rng, { seq: 1, name: 'FIRST_INNINGS', bat: first, bowl: second, oneDay: true, ...i0 })
      const chase = Number(p1.teams[1].statistics.find((s) => s.type === 'TOTAL_SCORE')?.value ?? 0)
      periods = [p1, playInnings(rng, { seq: 2, name: 'FIRST_INNINGS', bat: second, bowl: first, oneDay: true, target: i1.target ?? (clubOutcome.startsWith('WON') === !clubBatsFirst ? chase + 1 : undefined), ...i1 })]
      // A chase that is meant to fall short: leave it as generated.
    } else {
      const o = (i: number) => spec.inn?.[i] ?? {}
      const p1 = playInnings(rng, { seq: 1, name: 'FIRST_INNINGS', bat: first, bowl: second, ...o(0) })
      const p2 = playInnings(rng, { seq: 2, name: 'FIRST_INNINGS', bat: second, bowl: first, ...o(1) })
      if (spec.twoInnings) {
        periods = [p1, p2, placeholderInnings(3, 'SECOND_INNINGS', first, second), emptyPeriod(4, 'SECOND_INNINGS', second, first)]
      } else {
        periods = [p1, p2, playInnings(rng, { seq: 3, name: 'SECOND_INNINGS', bat: first, bowl: second, ...o(2) }), playInnings(rng, { seq: 4, name: 'SECOND_INNINGS', bat: second, bowl: first, ...o(3) })]
      }
    }

    const tossWinner = spec.skipPlay === 'abandoned' || spec.skipPlay?.startsWith('forfeit') ? null : rng() < 0.5 ? club : opp
    const startsAt = `${spec.date}T02:00:00.000Z`
    const status = spec.skipPlay === 'abandoned' ? 'ABANDONED' : 'FINAL'
    const raw: RawGameSummary = {
      id: uuid(6, n), status, type: spec.kind,
      grade: GRADE, round: { name: spec.round, abbreviatedName: spec.round.replace('Round ', 'R').replace('Semi Final', 'SF').replace('Grand Final', 'GF'), isFinalRound: /Final/.test(spec.round) },
      schedule: spec.kind === 'twoDay'
        ? [{ day: 1, dateTime: startsAt }, { day: 2, dateTime: new Date(Date.parse(startsAt) + 7 * 86_400_000).toISOString() }]
        : [{ day: null, dateTime: startsAt }],
      teams: [
        { id: club.teamId, name: club.teamName, isHomeTeam: home, outcome: clubOutcome, organisation: { id: club.orgId, name: club.orgName } },
        { id: opp.teamId, name: opp.teamName, isHomeTeam: !home, outcome: oppOutcome, organisation: { id: opp.orgId, name: opp.orgName } },
      ],
      appearances,
      coinToss: tossWinner ? { winningTeamId: tossWinner.teamId, preference: rng() < 0.5 ? 'BAT' : 'BOWL' } : null,
      periods,
      playingSurfaces: [{ id: uuid(8, 1), name: 'Main oval', venue: { id: uuid(9, 1), name: home ? 'Seed Recreation Reserve' : `${oppClub} Reserve`, timezone: 'Australia/Melbourne' } }],
    }
    const localDate = spec.date
    const fixture: SeedGame['fixture'] = {
      updatedAt: `${localDate}T12:00:00.000Z`, venueSuburb: home ? 'SEEDVILLE' : oppClub.toUpperCase(), localDate,
      gradeId: GRADE.id, gradeName: GRADE.name, roundName: spec.round, roundAbbr: raw.round!.abbreviatedName, isFinalRound: raw.round!.isFinalRound,
    }
    out.push({ raw, seasonName: season.name, seasonStartYear: season.startYear, competitionName: season.competitionName, fixture, edge: spec.edge ?? null })
  })
  return out
}
