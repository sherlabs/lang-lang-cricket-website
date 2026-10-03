import { qualifies, type QualScope } from '@/lib/stats/qualify'
import { bowlingAverages, battingAverages } from '@/lib/playhq/players'
import type { SeasonCounts } from '@/lib/players/season-math'

/**
 * Pure content rules for the share card (spec A6): which role a player reads as, and the four
 * headline stats. Role compares runs with wickets scaled by 20 (the same factor the yearbook
 * all-rounder ranking uses), so a 2,000-run batter with a few wickets is a batter.
 */
export type CardRole = 'batter' | 'bowler' | 'allrounder'
export const CARD_FORMATS = ['og', 'square'] as const
export type CardFormat = (typeof CARD_FORMATS)[number]
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
}

/** Anything outside the whitelist is treated as the default, so the cache key space stays finite. */
export const parseFormat = (v: string | null | undefined): CardFormat => (CARD_FORMATS as readonly string[]).includes(v ?? '') ? (v as CardFormat) : 'og'
/** A season must be a known season name; unknown values mean "all seasons". */
export const parseCardSeason = (v: string | null | undefined, known: readonly string[]): string | null => (v && known.includes(v) ? v : null)

export function cardRole(c: SeasonCounts): CardRole {
  const bat = c.batRuns, bowl = c.bowlWickets * 20
  if (bat === 0 && bowl === 0) return 'batter'
  if (bat >= bowl * 1.5) return 'batter'
  if (bowl >= bat * 1.5) return 'bowler'
  return 'allrounder'
}

export type CardStat = { label: string; value: string }

/** Rates (average, economy) show a dash until they meet the qualification minimums for the scope. */
export function cardStats(c: SeasonCounts, role: CardRole, scope: QualScope): CardStat[] {
  const bat = battingAverages({ runs: c.batRuns, innings: c.batInnings, notOuts: c.batNotOuts, balls: c.batBalls })
  const bowl = bowlingAverages({ balls: c.bowlBalls, runs: c.bowlRuns, wickets: c.bowlWickets })
  const hs = c.batInnings > 0 ? `${c.batHighScore}${c.batHighScoreNotOut ? '*' : ''}` : '–'
  const avg = bat.average == null || !qualifies('batAvg', c, scope) ? '–' : bat.average.toFixed(2)
  const econ = bowl.economy == null || !qualifies('econ', c, scope) ? '–' : bowl.economy.toFixed(2)
  const best = c.bowlBalls > 0 && c.bowlBestWickets > 0 ? `${c.bowlBestWickets}/${c.bowlBestRuns}` : '–'
  switch (role) {
    case 'batter': return [{ label: 'Runs', value: String(c.batRuns) }, { label: 'Average', value: avg }, { label: 'High score', value: hs }, { label: 'Games', value: String(c.games) }]
    case 'bowler': return [{ label: 'Wickets', value: String(c.bowlWickets) }, { label: 'Economy', value: econ }, { label: 'Best', value: best }, { label: 'Games', value: String(c.games) }]
    case 'allrounder': return [{ label: 'Runs', value: String(c.batRuns) }, { label: 'Wickets', value: String(c.bowlWickets) }, { label: 'Average', value: avg }, { label: 'Games', value: String(c.games) }]
  }
}

export const ROLE_LABEL: Record<CardRole, string> = { batter: 'Batter', bowler: 'Bowler', allrounder: 'All-rounder' }

/** Only an image type satori can draw is fetched; anything else falls back to the bundled crest. */
export const isDrawableImageType = (contentType: string | null | undefined): boolean => /^image\/(png|jpe?g)\b/i.test(contentType ?? '')
