import type { StoredBundle } from '@/lib/match-store/read'
import type { MatchResult } from '@/lib/playhq/match-rows'
import type { Game } from '@/lib/playhq/types'
import { isFinished } from '@/lib/playhq/games'
import { countsByPlayer } from './counts'
import { ALLROUNDER_FORMULA, ALLROUNDER_MIN_RUNS, ALLROUNDER_MIN_WICKETS, ALLROUNDER_WICKET_WEIGHT } from '../yearbook'
import type { FactSet } from './types'

/**
 * Match-data sections of a season yearbook (W2 spec 5.5). Pure: the page loads the stored matches of
 * the season (cached) and these functions turn them into results lines, a win/loss progression, and
 * all-rounder figures. Nothing here estimates; a score is shown only as the scorer recorded it.
 */
export type InningsScore = { seq: number; runs: number; wickets: number; balls: number; declared: boolean; allOut: boolean }

export type ResultLine = {
  gameId: string
  date: string | null
  round: string | null
  isFinalRound: boolean
  grade: string | null
  team: string
  opponent: string
  format: string
  result: MatchResult | null
  forfeit: boolean
  onFirstInnings: boolean
  /** Played innings only, in order; the two-day placeholder innings is not in the list. */
  club: InningsScore[]
  opp: InningsScore[]
}

/** The line of one stored FINAL match; null for anything else. Pure and free of player data. */
export function resultLineOf(b: Pick<StoredBundle, 'match' | 'innings'>): ResultLine | null {
  const m = b.match
  if (m.status !== 'FINAL') return null
  const score = (club: boolean): InningsScore[] =>
    b.innings
      .filter((i) => i.played && i.isClubBatting === club)
      .sort((x, y) => x.sequenceNo - y.sequenceNo)
      .map((i) => ({ seq: i.sequenceNo, runs: i.totalRuns, wickets: i.totalWickets, balls: i.totalBalls, declared: i.declared, allOut: i.allOut }))
  return {
    gameId: m.gameId, date: m.localDate, round: m.roundName, isFinalRound: m.isFinalRound, grade: m.gradeName, team: m.clubTeamName,
    opponent: m.opponentOrgName?.trim() || m.opponentName?.trim() || 'Unknown opposition',
    format: m.type, result: m.result, forfeit: m.byForfeit, onFirstInnings: m.onFirstInnings, club: score(true), opp: score(false),
  }
}

/** Overs from balls: 245 balls is `40.5`. */
export const oversText = (balls: number): string => `${Math.floor(balls / 6)}.${balls % 6}`

/** `152/6 (40.0 ov)`; `152/6d` when declared; `152 all out` is left to the wickets (`152/10`). */
export function inningsText(s: InningsScore): string {
  return `${s.runs}/${s.wickets}${s.declared ? 'd' : ''}${s.balls > 0 ? ` (${oversText(s.balls)} ov)` : ''}`
}

/** All played innings of one side: one for a one-day game, two for a two-day game (joined with `&`). */
export const sideScore = (innings: readonly InningsScore[]): string => (innings.length ? innings.map(inningsText).join(' & ') : '–')

export type ResultLetter = 'W' | 'L' | 'D' | 'T' | 'N'
export const RESULT_WORDS: Record<ResultLetter, string> = { W: 'Won', L: 'Lost', D: 'Drawn', T: 'Tied', N: 'No result' }

export function resultLetter(l: Pick<ResultLine, 'result'>): ResultLetter {
  switch (l.result) {
    case 'won': return 'W'
    case 'lost': return 'L'
    case 'draw': return 'D'
    case 'tie': return 'T'
    default: return 'N'
  }
}

/** `Won`, `Won by forfeit`, `Won on first innings`. */
export function resultWord(l: Pick<ResultLine, 'result' | 'forfeit' | 'onFirstInnings'>): string {
  const word = RESULT_WORDS[resultLetter(l)]
  return l.forfeit ? `${word} by forfeit` : l.onFirstInnings && (l.result === 'won' || l.result === 'lost') ? `${word} on first innings` : word
}

const byDate = (a: ResultLine, b: ResultLine) => (a.date ?? '').localeCompare(b.date ?? '') || a.gameId.localeCompare(b.gameId)

export type GradeLines = { grade: string; lines: ResultLine[] }

/** Lines grouped by (canonical) grade, grades in natural order, games newest first. */
export function resultsByGradeFromLines(lines: readonly ResultLine[], gradeLabel: (g: string | null) => string | null = (g) => g): GradeLines[] {
  const by = new Map<string, ResultLine[]>()
  for (const l of lines) {
    const g = gradeLabel(l.grade) || 'Other'
    by.set(g, [...(by.get(g) ?? []), l])
  }
  return [...by]
    .map(([grade, ls]) => ({ grade, lines: ls.sort((a, b) => byDate(b, a)) }))
    .sort((a, b) => a.grade.localeCompare(b.grade, undefined, { numeric: true }))
}

export type ProgressionCell = { gameId: string; date: string | null; opponent: string; letter: ResultLetter; word: string; forfeit: boolean; wins: number; losses: number; net: number }
export type GradeProgression = { grade: string; cells: ProgressionCell[] }

/**
 * Per grade, the games in date order with the running wins minus losses. A drawn, tied or no-result
 * game keeps the line level; a forfeit counts as the win or loss it was and is marked.
 */
export function progressionByGrade(lines: readonly ResultLine[], gradeLabel: (g: string | null) => string | null = (g) => g): GradeProgression[] {
  return resultsByGradeFromLines(lines, gradeLabel).map(({ grade, lines: ls }) => {
    let wins = 0, losses = 0
    const cells = [...ls].sort(byDate).map<ProgressionCell>((l) => {
      const letter = resultLetter(l)
      if (letter === 'W') wins++
      if (letter === 'L') losses++
      return { gameId: l.gameId, date: l.date, opponent: l.opponent, letter, word: resultWord(l), forfeit: l.forfeit, wins, losses, net: wins - losses }
    })
    return { grade, cells }
  })
}

/** Season results line counts used for the "N of M finished games stored" caption. */
export type StoredShare = { stored: number; live: number | null; complete: boolean }

/**
 * "Complete enough" to replace the PlayHQ results (W2 spec 5.5): every finished, non-abandoned,
 * non-derby live game is stored. With no live list (PlayHQ unreachable or no such season), stored data
 * is used as it is. The sources are never mixed in one section.
 */
export function storedShare(stored: readonly ResultLine[], live: readonly Game[] | null): StoredShare {
  if (live === null) return { stored: stored.length, live: null, complete: stored.length > 0 }
  const liveFinished = live.filter((g) => isFinished(g) && g.status !== 'ABANDONED' && !g.isClubDerby)
  const ids = new Set(stored.map((l) => l.gameId))
  return { stored: stored.length, live: liveFinished.length, complete: stored.length > 0 && liveFinished.every((g) => ids.has(g.id)) }
}

export function shareText(s: StoredShare): string {
  return s.live === null ? `${s.stored} finished ${s.stored === 1 ? 'game' : 'games'} stored.` : `${s.stored} of ${s.live} finished games stored.`
}

/** All-rounder figures from match data: the same rule as the season-total block, over the season's stored matches. */
export function matchAllRounders(set: FactSet, limit = 5): { playerId: number; runs: number; wickets: number; score: number; rank: number }[] {
  const rows = [...countsByPlayer(set)]
    .filter(([, c]) => c.bowlingInnings > 0 && c.runs >= ALLROUNDER_MIN_RUNS && c.wickets >= ALLROUNDER_MIN_WICKETS)
    .map(([playerId, c]) => ({ playerId, runs: c.runs, wickets: c.wickets, score: c.runs + ALLROUNDER_WICKET_WEIGHT * c.wickets }))
    .sort((a, b) => b.score - a.score || a.playerId - b.playerId)
  let rank = 0
  return rows.map((r, i) => {
    if (i === 0 || r.score !== rows[i - 1].score) rank = i + 1
    return { ...r, rank }
  }).filter((r) => r.rank <= limit).slice(0, limit * 2)
}
export { ALLROUNDER_FORMULA }
