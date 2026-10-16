/**
 * Minimum sample sizes for match-derived rates (W2 spec 2.8). Admin-editable under
 * `site-settings.stats.matchMinimums`; these are the defaults and the validation bounds.
 */
export type MatchMinimums = {
  /** Batting innings against one opposition before an average shows. */
  oppositionInnings: number
  /** Balls bowled against one opposition (72 = twelve overs) before an average or economy shows. */
  oppositionBalls: number
  /** Innings in a batting-position bucket before its average shows. */
  positionInnings: number
  /** Dismissals (or innings) before a percentage share shows. */
  rateInnings: number
  /** Non-forfeit games before a win percentage shows. */
  winGames: number
  /** Balls faced (rows with full ball data) before balls per boundary shows. */
  ballsForBoundary: number
  /** Shared partnerships before a "most successful partner" shows. */
  partnershipPairGames: number
}

export const DEFAULT_MATCH_MINIMUMS: MatchMinimums = {
  oppositionInnings: 3,
  oppositionBalls: 72,
  positionInnings: 5,
  rateInnings: 10,
  winGames: 10,
  ballsForBoundary: 100,
  partnershipPairGames: 2,
}

export const MATCH_MINIMUM_LABELS: Record<keyof MatchMinimums, string> = {
  oppositionInnings: 'Against an opposition: min batting innings',
  oppositionBalls: 'Against an opposition: min balls bowled',
  positionInnings: 'Batting position: min innings in a group',
  rateInnings: 'Percentages: min dismissals',
  winGames: 'Win percentage: min games',
  ballsForBoundary: 'Balls per boundary: min balls faced',
  partnershipPairGames: 'Most successful partner: min shared stands',
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Coerce a saved group into a complete object; every field falls back to its default. */
export function resolveMatchMinimums(raw: unknown): MatchMinimums {
  const o = isObj(raw) ? raw : {}
  const out = { ...DEFAULT_MATCH_MINIMUMS }
  for (const k of Object.keys(out) as (keyof MatchMinimums)[]) {
    const v = o[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v)
  }
  return out
}
