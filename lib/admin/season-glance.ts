import { classifyGrade, type GradeRule } from '@/lib/stats/categories'
import { progressionByGrade, resultLetter, resultWord, type ResultLine } from '@/lib/stats/match/yearbook'
import type { MatchResult } from '@/lib/playhq/match-rows'

/**
 * "Season at a glance" on the admin Home page (wave G WP-3). Pure over STORED data (the match store and the stored upcoming games);
 * it never calls PlayHQ.
 *
 * Honesty rules:
 * - It names the team and grade each row describes: every senior grade of the latest season, in natural order (what the public
 *   results lead with), by the public labels the caller passes in.
 * - Won and lost come from `progressionByGrade`, the same helper the season yearbook uses, so a forfeit counts as the win or loss it
 *   was; "played" leaves out abandoned games. The card never does its own win/loss arithmetic.
 * - It says "as of" the last successful sync, and is left out (null) when that data is older than SEASON_CARD_MAX_AGE_DAYS.
 * - A ladder position is shown only when the ladder belongs to the same grade and season as the card; otherwise it is dropped.
 */
export const SEASON_CARD_MAX_AGE_DAYS = 21

export type GlanceMatch = {
  gameId: string
  localDate: string | null
  seasonStartYear: number | null
  gradeName: string | null
  clubTeamName: string | null
  opponentName: string | null
  opponentOrgName: string | null
  type: string | null
  result: MatchResult | null
  byForfeit: boolean
  onFirstInnings: boolean
}
export type GlanceFixture = { gameId: string; gradeName: string | null; localDate: string; localTime: string | null; opponentName: string; isHome: boolean }
/** A stored ladder, if one ever exists. Today there is none (the public ladder is fetched live), so the card passes null. */
export type GlanceLadder = { gradeName: string; seasonStartYear: number; position: number; of: number }

export type SeasonGlance = {
  team: string
  grade: string
  seasonStartYear: number
  asOf: Date
  played: number
  won: number
  lost: number
  nextGame: { date: string; time: string | null; opponent: string; home: boolean } | null
  lastResult: { date: string | null; opponent: string; word: string; letter: ReturnType<typeof resultLetter> } | null
  ladder: { position: number; of: number } | null
}

export type GlanceInput = {
  matches: readonly GlanceMatch[]
  fixtures: readonly GlanceFixture[]
  ladder?: GlanceLadder | null
  /** Date of the last successful sync (or the newest stored match write). Null: unknown, so the card is left out. */
  asOf: Date | null
  now: Date
  /** The club's calendar day, YYYY-MM-DD, for "next game". */
  today: string
  rules?: readonly GradeRule[]
  /** Public labels (admin renames and tidy spellings). Identity when omitted. */
  gradeLabel?: (raw: string | null) => string
  teamLabel?: (raw: string | null) => string
}

const DAY = 86_400_000
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true })
const lineOf = (m: GlanceMatch, grade: string, team: string): ResultLine => ({
  gameId: m.gameId, date: m.localDate, round: null, isFinalRound: false, grade, team,
  opponent: m.opponentOrgName?.trim() || m.opponentName?.trim() || 'Unknown opposition',
  format: m.type ?? '', result: m.result, forfeit: m.byForfeit, onFirstInnings: m.onFirstInnings, club: [], opp: [],
})

/** One glance per senior grade of the latest season, in natural grade order. Empty when the data is old or missing. */
export function buildSeasonGlances(i: GlanceInput): SeasonGlance[] {
  if (!i.asOf || i.now.getTime() - i.asOf.getTime() > SEASON_CARD_MAX_AGE_DAYS * DAY) return []
  const gradeOf = i.gradeLabel ?? ((g: string | null) => g ?? '')
  const teamOf = i.teamLabel ?? ((t: string | null) => t ?? '')
  const senior = i.matches.filter((m) => m.seasonStartYear !== null && classifyGrade(gradeOf(m.gradeName), teamOf(m.clubTeamName), i.rules ?? []) === 'senior' && gradeOf(m.gradeName) !== '')
  if (senior.length === 0) return []
  const year = Math.max(...senior.map((m) => m.seasonStartYear as number))
  const inYear = senior.filter((m) => m.seasonStartYear === year)
  return [...new Set(inYear.map((m) => gradeOf(m.gradeName)))].sort(natural).map((grade) => glanceFor(i, inYear, grade, year, gradeOf, teamOf))
}

/** The leading senior grade only (the first of `buildSeasonGlances`). */
export function buildSeasonGlance(i: GlanceInput): SeasonGlance | null {
  return buildSeasonGlances(i)[0] ?? null
}

function glanceFor(i: GlanceInput, inYear: readonly GlanceMatch[], grade: string, year: number, gradeOf: (g: string | null) => string, teamOf: (t: string | null) => string): SeasonGlance {
  const games = inYear.filter((m) => gradeOf(m.gradeName) === grade)
  const newest = [...games].sort((a, b) => (b.localDate ?? '').localeCompare(a.localDate ?? '') || b.gameId.localeCompare(a.gameId))[0]
  const team = teamOf(newest.clubTeamName)
  const lines = games.map((m) => lineOf(m, grade, team))

  const cells = progressionByGrade(lines)[0]?.cells ?? []
  const last = cells[cells.length - 1]
  const finished = lines.filter((l) => l.result !== 'abandoned')
  const resulted = [...lines].filter((l) => resultLetter(l) !== 'U').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.gameId.localeCompare(a.gameId))[0]

  const next = [...i.fixtures]
    .filter((f) => f.localDate >= i.today && gradeOf(f.gradeName) === grade)
    .sort((a, b) => a.localDate.localeCompare(b.localDate) || (a.localTime ?? '').localeCompare(b.localTime ?? '') || a.gameId.localeCompare(b.gameId))[0]

  const l = i.ladder
  return {
    team, grade, seasonStartYear: year, asOf: i.asOf as Date,
    played: finished.length, won: last?.wins ?? 0, lost: last?.losses ?? 0,
    nextGame: next ? { date: next.localDate, time: next.localTime, opponent: next.opponentName, home: next.isHome } : null,
    lastResult: resulted ? { date: resulted.date, opponent: resulted.opponent, word: resultWord(resulted), letter: resultLetter(resulted) } : null,
    ladder: l && gradeOf(l.gradeName) === grade && l.seasonStartYear === year ? { position: l.position, of: l.of } : null,
  }
}

/** The tooltip that states the rule behind the numbers. */
export const RECORD_RULE = 'Won and lost follow the season yearbook: a forfeit counts as the win or loss it was. Abandoned games are not counted as played.'
