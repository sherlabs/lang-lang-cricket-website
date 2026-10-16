import { CLUB_LOCALE } from '@/config/site'
import { inningsKey, type FactSet } from './types'

/**
 * Coverage of the match store (W2 spec rule 0.2 and 0.3). It is computed from the stored matches,
 * never from the season table, because the two windows differ. One caption function feeds pages,
 * CSV sidecars and the yearbook.
 */
export type MatchCoverage = {
  games: number
  /** First stored match date (`yyyy-mm-dd`) and its season name; null with no matches. */
  firstDate: string | null
  firstSeason: string | null
  /** Played innings, club batting: with ball-by-ball totals, with fall of wickets. */
  battingInnings: number
  ballInnings: number
  fowInnings: number
  /** Played innings, club bowling: with bowling figures. */
  bowlingInnings: number
  bowlingDataInnings: number
  /** Played innings, club bowling, with at least one fielding scorecard row (run outs, stumpings). */
  fieldingInnings: number
  /** Present when only the newest `kept` of `total` stored seasons were read. */
  seasonCap?: { kept: number; total: number }
}

export type CoverageNeed = 'balls' | 'bowling' | 'fow' | 'fielding'

export function coverageOf(set: FactSet): MatchCoverage {
  const cov: MatchCoverage = { games: set.matches.size, firstDate: null, firstSeason: null, battingInnings: 0, ballInnings: 0, fowInnings: 0, bowlingInnings: 0, bowlingDataInnings: 0, fieldingInnings: 0 }
  for (const h of set.matches.values()) {
    if (h.date && (cov.firstDate === null || h.date < cov.firstDate)) {
      cov.firstDate = h.date
      cov.firstSeason = h.seasonName
    }
  }
  if (cov.firstDate === null) cov.firstSeason = [...set.matches.values()].map((h) => h.seasonName).sort()[0] ?? null
  for (const i of set.innings.values()) {
    if (i.clubBatting) {
      cov.battingInnings++
      if (i.hasBall) cov.ballInnings++
      if (i.hasFow) cov.fowInnings++
    } else {
      cov.bowlingInnings++
      if (i.hasBowling) cov.bowlingDataInnings++
    }
  }
  cov.fieldingInnings = new Set(set.credits.filter((f) => f.runOuts !== null).map((f) => inningsKey(f.m, f.seq))).size
  if (set.seasonCap) cov.seasonCap = set.seasonCap
  return cov
}

const NEED_TEXT: Record<CoverageNeed, string> = { balls: 'ball-by-ball totals', bowling: 'bowling figures', fow: 'fall of wickets', fielding: 'fielding records' }

export function formatCoverageDate(isoDate: string, locale: string = CLUB_LOCALE): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/**
 * `From <first date>, <N> games stored. <K> of <M> innings have <what>.` One sentence per distinct need, and a note when
 * only the newest seasons were read.
 */
export function coverageCaption(c: MatchCoverage, need?: CoverageNeed | readonly (CoverageNeed | null | undefined)[], locale: string = CLUB_LOCALE): string {
  if (c.games === 0) return 'No matches are stored yet.'
  const from = c.firstDate ? formatCoverageDate(c.firstDate, locale) : (c.firstSeason ?? 'the first stored match')
  let text = `From ${from}, ${c.games} ${c.games === 1 ? 'game' : 'games'} stored.`
  if (c.seasonCap) text += ` Only the newest ${c.seasonCap.kept} of ${c.seasonCap.total} stored seasons are included.`
  const needs = [...new Set((Array.isArray(need) ? need : [need]).filter((n): n is CoverageNeed => !!n))]
  for (const n of needs) {
    const [k, m] = n === 'balls' ? [c.ballInnings, c.battingInnings] : n === 'fow' ? [c.fowInnings, c.battingInnings] : n === 'fielding' ? [c.fieldingInnings, c.bowlingInnings] : [c.bowlingDataInnings, c.bowlingInnings]
    text += ` ${k} of ${m} innings have ${NEED_TEXT[n]}.`
  }
  return text
}
