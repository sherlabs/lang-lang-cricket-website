import { CLUB_LOCALE } from '@/config/site'
import type { FactSet } from './types'

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
}

export type CoverageNeed = 'balls' | 'bowling' | 'fow'

export function coverageOf(set: FactSet): MatchCoverage {
  const cov: MatchCoverage = { games: set.matches.size, firstDate: null, firstSeason: null, battingInnings: 0, ballInnings: 0, fowInnings: 0, bowlingInnings: 0, bowlingDataInnings: 0 }
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
  return cov
}

const NEED_TEXT: Record<CoverageNeed, string> = { balls: 'ball-by-ball totals', bowling: 'bowling figures', fow: 'fall of wickets' }

export function formatCoverageDate(isoDate: string, locale: string = CLUB_LOCALE): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return isoDate
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/** `From <first date>, <N> games stored. <K> of <M> innings have <what>.` */
export function coverageCaption(c: MatchCoverage, need?: CoverageNeed, locale: string = CLUB_LOCALE): string {
  if (c.games === 0) return 'No matches are stored yet.'
  const from = c.firstDate ? formatCoverageDate(c.firstDate, locale) : (c.firstSeason ?? 'the first stored match')
  const head = `From ${from}, ${c.games} ${c.games === 1 ? 'game' : 'games'} stored.`
  if (!need) return head
  const [k, m] = need === 'balls' ? [c.ballInnings, c.battingInnings] : need === 'fow' ? [c.fowInnings, c.battingInnings] : [c.bowlingDataInnings, c.bowlingInnings]
  return `${head} ${k} of ${m} innings have ${NEED_TEXT[need]}.`
}
