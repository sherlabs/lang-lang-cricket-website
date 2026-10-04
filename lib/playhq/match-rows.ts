import { createHash } from 'node:crypto'
import { CLUB_TIMEZONE } from '@/config/site'
import { displayName } from './names'
import { oversToBalls } from './players'
import { isInningsPlayed } from './scorecard'
import type { Game, RawGameSummary, RawPeriod, RawPeriodAppearance, RawPeriodTeam, RawStat } from './types'

/**
 * Pure mapping of one PlayHQ game summary to the rows of the per-match store (WP-M, spec M2/M4).
 * No database, no Next imports. Rows carry no database ids: children point at their innings by
 * `inningsSeq` and at people by PlayHQ `appearanceId`, and `lib/match-store/write.ts` resolves both.
 * Never throws on odd shapes (abandoned games, missing disciplines, empty periods): it emits what
 * exists and records `warnings` for anything it did not recognise.
 */

/** Bump when the mapping changes, so every stored game is re-written on the next sync. */
export const MAPPER_VERSION = 1

export type MatchResult = 'won' | 'lost' | 'draw' | 'tie' | 'no_result' | 'abandoned'
export type BattingStatus = 'out' | 'not_out' | 'did_not_bat' | 'unknown'
export type DismissalType = 'bowled' | 'caught' | 'caught_and_bowled' | 'lbw' | 'stumped' | 'run_out' | 'hit_wicket' | 'retired_hurt' | 'retired' | 'retired_out' | 'other'

export type MatchRow = {
  gameId: string; status: string; type: string
  seasonName: string; seasonStartYear: number | null; competitionName: string
  gradeId: string | null; gradeName: string | null; roundName: string | null; roundAbbr: string | null; isFinalRound: boolean
  startsAt: string | null; localDate: string | null; days: number
  venueName: string | null; venueSuburb: string | null
  clubTeamId: string; clubTeamName: string
  opponentTeamId: string | null; opponentName: string | null; opponentOrgId: string | null; opponentOrgName: string | null
  isHome: boolean
  tossWinnerTeamId: string | null; tossChoice: 'bat' | 'bowl' | null; clubWonToss: boolean | null
  clubOutcome: string | null; opponentOutcome: string | null
  result: MatchResult | null; byForfeit: boolean; onFirstInnings: boolean
  playhqUpdatedAt: string | null
}
export type InningsRow = {
  sequenceNo: number; periodName: string | null; battingTeamId: string | null; bowlingTeamId: string | null; isClubBatting: boolean
  periodStatus: string | null; played: boolean; declared: boolean; allOut: boolean
  totalRuns: number; totalWickets: number; totalBalls: number
  extrasTotal: number; wides: number; noBalls: number; byes: number; legByes: number; penalty: number
  hasFallOfWickets: boolean; hasBowlingData: boolean; hasBallData: boolean
}
export type AppearanceRow = {
  appearanceId: string; teamId: string; isClubSide: boolean
  nameKey: string | null       // club side only
  displayName: string | null   // opposition only
  captainRole: string | null; isFillIn: boolean; isRegisteredPlayer: boolean; playerNumber: number | null
}
export type BattingRow = {
  inningsSeq: number; appearanceId: string; position: number; battingStatus: BattingStatus
  runs: number; balls: number | null; fours: number | null; sixes: number | null
  dismissalType: DismissalType | null; bowlerAppearanceId: string | null; fielderAppearanceId: string | null
  fowWicket: number | null; fowRuns: number | null
}
export type BowlingRow = { inningsSeq: number; appearanceId: string; order: number; balls: number; maidens: number; runs: number; wickets: number; wides: number; noBalls: number }
export type FieldingRow = { inningsSeq: number; appearanceId: string; catches: number; keeperCatches: number; stumpings: number; runOutsAssisted: number; runOutsUnassisted: number }

export type MatchBundle = {
  match: MatchRow
  innings: InningsRow[]
  appearances: AppearanceRow[]
  batting: BattingRow[]
  bowling: BowlingRow[]
  fielding: FieldingRow[]
  /** sha1 of the mapped rows (not `playhqUpdatedAt`); unchanged rows give an unchanged hash. */
  sourceHash: string
  /** Shapes the mapper did not recognise (`unknown_dismissal:X`, `unknown_outcome:X`, ...). */
  warnings: string[]
}
export type SkipReason = 'not_final' | 'no_club_side' | 'junior' | 'club_vs_club'
export type MatchSkip = { skip: SkipReason }
export type MatchCtx = {
  clubOrgId: string
  clubIds: ReadonlySet<string>
  seasonName: string
  seasonStartYear: number | null
  competitionName: string
  isJunior: boolean
  fixture: Pick<Game, 'updatedAt' | 'venueSuburb' | 'localDate' | 'gradeId' | 'gradeName' | 'roundName' | 'roundAbbr' | 'isFinalRound'> | null
}

export const isSkip = (x: MatchBundle | MatchSkip): x is MatchSkip => 'skip' in x

const stat = (stats: readonly RawStat[], type: string): number | null => stats.find((s) => s.type === type)?.value ?? null
const num = (stats: readonly RawStat[], type: string) => stat(stats, type) ?? 0

/** The `first|last` lower-case key shared with `player-aliases` (trim only, as `aggregatePlayers` does). */
export const nameKeyOf = (p: { firstName: string; lastName: string }) => `${(p.firstName ?? '').trim()}|${(p.lastName ?? '').trim()}`.toLowerCase()

export function seasonStartYearOf(seasonName: string): number | null {
  const m = /\d{4}/.exec(seasonName)
  return m ? Number(m[0]) : null
}

export function normaliseOutcome(o: string | null | undefined): { result: MatchResult | null; byForfeit: boolean; onFirstInnings: boolean; known: boolean } {
  const byForfeit = !!o && o.endsWith('_BY_FORFEIT')
  const onFirstInnings = !!o && o.endsWith('_ON_FIRST_INNINGS')
  if (!o) return { result: null, byForfeit, onFirstInnings, known: true }
  let result: MatchResult | null = null
  if (o.startsWith('WON')) result = 'won'
  else if (o.startsWith('LOST')) result = 'lost'
  else if (o === 'DRAW' || o === 'DREW') result = 'draw'
  else if (o === 'TIE' || o === 'TIED') result = 'tie'
  else if (o === 'NO_RESULT') result = 'no_result'
  else if (o === 'ABANDONED') result = 'abandoned'
  return { result, byForfeit, onFirstInnings, known: result !== null }
}

const DISMISSALS: Record<string, DismissalType> = {
  BOWLED: 'bowled', CAUGHT: 'caught', LEG_BEFORE_WICKET: 'lbw', STUMPED: 'stumped', RUN_OUT: 'run_out',
  HIT_WICKET: 'hit_wicket', RETIRED_HURT: 'retired_hurt', RETIRED: 'retired', RETIRED_OUT: 'retired_out',
}
const FIELDING_STATS = ['CATCHES_AS_FIELDER', 'CATCHES_AS_WICKET_KEEPER', 'TOTAL_CATCHES', 'STUMPINGS', 'RUN_OUTS_ASSISTED', 'RUN_OUTS_UNASSISTED', 'TOTAL_RUN_OUTS']

function localDateOf(iso: string | null, tz: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIMEZONE }).format(d)
  }
}

/** Key-sorted JSON, so the hash does not depend on property order. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v ?? null)
}

export function hashBundle(b: Omit<MatchBundle, 'sourceHash' | 'warnings'>): string {
  const { playhqUpdatedAt: _ignored, ...match } = b.match
  void _ignored
  return createHash('sha1')
    .update(stableStringify({ v: MAPPER_VERSION, match, innings: b.innings, appearances: b.appearances, batting: b.batting, bowling: b.bowling, fielding: b.fielding }))
    .digest('hex')
}

export function mapMatchBundle(raw: RawGameSummary, ctx: MatchCtx): MatchBundle | MatchSkip {
  if (raw.status !== 'FINAL') return { skip: 'not_final' }
  if (ctx.isJunior) return { skip: 'junior' }
  const teams = raw.teams ?? []
  const clubTeams = teams.filter((t) => t.organisation?.id === ctx.clubOrgId)
  if (clubTeams.length === 0) return { skip: 'no_club_side' }
  if (clubTeams.length > 1 || teams.filter((t) => ctx.clubIds.has(t.id)).length > 1) return { skip: 'club_vs_club' }
  const club = clubTeams[0]
  const opp = teams.find((t) => t.id !== club.id) ?? null
  const warnings: string[] = []

  // Fail closed, as mapScorecard does: only visible Players (coaches and officials are appearances too).
  const players = new Map<string, RawGameSummary['appearances'][number]>()
  for (const a of raw.appearances ?? []) if (a.roleType === 'Player' && a.visible === true) players.set(a.id, a)

  const appearances: AppearanceRow[] = [...players.values()].map((a) => {
    const isClubSide = a.teamId === club.id
    return {
      appearanceId: a.id, teamId: a.teamId, isClubSide,
      nameKey: isClubSide ? nameKeyOf(a) : null,
      displayName: isClubSide ? null : displayName(a, false),
      captainRole: a.captainRole ?? null, isFillIn: a.isFillIn === true, isRegisteredPlayer: a.isRegisteredPlayer === true,
      playerNumber: a.playerNumber ?? null,
    }
  })

  const innings: InningsRow[] = []
  const batting: BattingRow[] = []
  const bowling: BowlingRow[] = []
  const fielding: FieldingRow[] = []

  for (const p of [...(raw.periods ?? [])].sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    const pTeams = p.teams ?? []
    const bat: RawPeriodTeam | undefined = pTeams.find((t) => t.discipline === 'BATTING')
    const bowl: RawPeriodTeam | undefined = pTeams.find((t) => t.discipline === 'BOWLING')
    if (!bat && !bowl) continue
    const battingTeamId = bat?.id ?? teams.find((t) => t.id !== bowl?.id)?.id ?? null
    const bowlingTeamId = bowl?.id ?? teams.find((t) => t.id !== bat?.id)?.id ?? null
    const seq = p.sequenceNo
    const s = bat?.statistics ?? []
    const batList: RawPeriodAppearance[] = bat?.appearances ?? []
    const bowlList: RawPeriodAppearance[] = bowl?.appearances ?? []
    const events: RawPeriod['sharedStatistics'] = p.sharedStatistics ?? []

    const fow = new Map((bat?.fallOfWickets ?? []).map((f) => [f.appearanceId, f]))
    const inningsBatting: BattingRow[] = []
    for (const a of batList) {
      if (!players.has(a.id)) continue
      const status: BattingStatus =
        a.status === 'DID_NOT_BAT' || (a.status === null && a.statistics.length === 0) ? 'did_not_bat'
        : a.status === 'OUT' ? 'out' : a.status === 'NOT_OUT' ? 'not_out' : 'unknown'
      const event = events.find((e) => e.appearances.some((x) => x.id === a.id && x.role === 'BATTING'))
      let dismissalType: DismissalType | null = null
      let bowlerId: string | null = null
      let fielderId: string | null = null
      if (event && status !== 'did_not_bat') {
        const rawBowler = event.appearances.find((x) => x.role === 'BOWLING')?.id ?? null
        const rawFielder = event.appearances.find((x) => x.role === 'FIELDING')?.id ?? null
        const known = DISMISSALS[event.type]
        if (!known) warnings.push(`unknown_dismissal:${event.type}`)
        dismissalType = known ?? 'other'
        if (known === 'caught' && rawBowler && rawFielder && rawBowler === rawFielder) dismissalType = 'caught_and_bowled'
        bowlerId = rawBowler && players.has(rawBowler) ? rawBowler : null
        fielderId = rawFielder && players.has(rawFielder) ? rawFielder : null
      }
      const f = fow.get(a.id)
      inningsBatting.push({
        inningsSeq: seq, appearanceId: a.id, position: a.displayOrder, battingStatus: status,
        runs: num(a.statistics, 'TOTAL_RUNS'), balls: stat(a.statistics, 'BALLS_FACED'),
        fours: stat(a.statistics, 'FOURS'), sixes: stat(a.statistics, 'SIXES'),
        dismissalType, bowlerAppearanceId: bowlerId, fielderAppearanceId: fielderId,
        fowWicket: f ? f.sequenceNo : null, fowRuns: f ? f.runs : null,
      })
    }
    batting.push(...inningsBatting)

    for (const a of bowlList) {
      if (!players.has(a.id)) continue
      const overs = num(a.statistics, 'OVERS')
      if (overs > 0) {
        bowling.push({
          inningsSeq: seq, appearanceId: a.id, order: a.displayOrder, balls: oversToBalls(overs),
          maidens: num(a.statistics, 'MAIDENS'), runs: num(a.statistics, 'RUNS'), wickets: num(a.statistics, 'WICKETS'),
          wides: num(a.statistics, 'WIDES'), noBalls: num(a.statistics, 'NO_BALLS'),
        })
      }
      if (a.statistics.some((x) => FIELDING_STATS.includes(x.type))) {
        fielding.push({
          inningsSeq: seq, appearanceId: a.id, catches: num(a.statistics, 'CATCHES_AS_FIELDER'),
          keeperCatches: num(a.statistics, 'CATCHES_AS_WICKET_KEEPER'), stumpings: num(a.statistics, 'STUMPINGS'),
          runOutsAssisted: num(a.statistics, 'RUN_OUTS_ASSISTED'), runOutsUnassisted: num(a.statistics, 'RUN_OUTS_UNASSISTED'),
        })
      }
    }

    const totalRuns = num(s, 'TOTAL_SCORE'), totalWickets = num(s, 'TOTAL_OUTS'), overs = num(s, 'TOTAL_OVERS')
    innings.push({
      sequenceNo: seq, periodName: p.name ?? null, battingTeamId, bowlingTeamId, isClubBatting: battingTeamId === club.id,
      periodStatus: bat?.status ?? null,
      // Exactly the rule the season aggregates use (placeholder second innings of a two-day game is not played).
      played: isInningsPlayed({
        total: { overs, runs: totalRuns, wickets: totalWickets },
        batting: inningsBatting.filter((b) => b.battingStatus !== 'did_not_bat').map((b) => ({ balls: b.balls ?? 0, runs: b.runs })),
      }),
      declared: bat?.status === 'DECLARED', allOut: bat?.status === 'ALL_OUT' || totalWickets >= 10,
      totalRuns, totalWickets, totalBalls: oversToBalls(overs),
      extrasTotal: num(s, 'TOTAL_EXTRAS'), wides: num(s, 'EXTRA_WIDES'), noBalls: num(s, 'EXTRA_NO_BALLS'),
      byes: num(s, 'EXTRA_BYES'), legByes: num(s, 'EXTRA_LEG_BYES'), penalty: num(s, 'EXTRA_PENALTY_RUNS'),
      hasFallOfWickets: (bat?.fallOfWickets?.length ?? 0) > 0,
      hasBowlingData: bowlList.some((a) => a.statistics.length > 0),
      hasBallData: batList.some((a) => a.statistics.some((x) => x.type === 'BALLS_FACED')),
    })
  }

  const surface = raw.playingSurfaces?.[0]
  const startsAt = raw.schedule?.[0]?.dateTime ?? null
  const tz = surface?.venue?.timezone || CLUB_TIMEZONE
  const outcome = normaliseOutcome(club.outcome)
  if (!outcome.known) warnings.push(`unknown_outcome:${club.outcome}`)
  const tossWinner = raw.coinToss?.winningTeamId ?? null
  const fx = ctx.fixture
  const match: MatchRow = {
    gameId: raw.id, status: raw.status, type: raw.type,
    seasonName: ctx.seasonName, seasonStartYear: ctx.seasonStartYear, competitionName: ctx.competitionName,
    gradeId: raw.grade?.id ?? fx?.gradeId ?? null, gradeName: raw.grade?.name ?? fx?.gradeName ?? null,
    roundName: raw.round?.name ?? fx?.roundName ?? null, roundAbbr: raw.round?.abbreviatedName ?? fx?.roundAbbr ?? null,
    isFinalRound: raw.round?.isFinalRound ?? fx?.isFinalRound ?? false,
    startsAt, localDate: localDateOf(startsAt, tz) ?? fx?.localDate ?? null, days: raw.type === 'twoDay' ? 2 : 1,
    venueName: surface?.venue?.name ?? null, venueSuburb: fx?.venueSuburb ?? null,
    clubTeamId: club.id, clubTeamName: club.name,
    opponentTeamId: opp?.id ?? null, opponentName: opp?.name ?? null, opponentOrgId: opp?.organisation?.id ?? null, opponentOrgName: opp?.organisation?.name ?? null,
    isHome: club.isHomeTeam === true,
    tossWinnerTeamId: tossWinner,
    tossChoice: raw.coinToss?.preference === 'BAT' ? 'bat' : raw.coinToss?.preference === 'BOWL' ? 'bowl' : null,
    clubWonToss: tossWinner ? tossWinner === club.id : null,
    clubOutcome: club.outcome ?? null, opponentOutcome: opp?.outcome ?? null,
    result: outcome.result, byForfeit: outcome.byForfeit, onFirstInnings: outcome.onFirstInnings,
    playhqUpdatedAt: fx?.updatedAt ?? null,
  }

  batting.sort((a, b) => a.inningsSeq - b.inningsSeq || a.position - b.position || a.appearanceId.localeCompare(b.appearanceId))
  bowling.sort((a, b) => a.inningsSeq - b.inningsSeq || a.order - b.order || a.appearanceId.localeCompare(b.appearanceId))
  fielding.sort((a, b) => a.inningsSeq - b.inningsSeq || a.appearanceId.localeCompare(b.appearanceId))
  appearances.sort((a, b) => a.appearanceId.localeCompare(b.appearanceId))
  const body = { match, innings, appearances, batting, bowling, fielding }
  return { ...body, sourceHash: hashBundle(body), warnings: [...new Set(warnings)] }
}
