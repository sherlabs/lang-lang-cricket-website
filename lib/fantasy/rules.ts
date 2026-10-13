/**
 * The rules of a fantasy season (wave F spec 4.2). Plain data, no database and no Next, so the collection definition, the pure
 * scoring/pricing/squad code and the pages all read one source. Money-like values are stored as tenths of a credit (integers).
 */
export const SCORING_KEYS = [
  'appearance', 'run', 'four', 'six', 'fifty', 'hundred', 'duck', 'wicket', 'maiden', 'threeWickets', 'fiveWickets', 'catch', 'stumping', 'runOut',
] as const
export type ScoringKey = (typeof SCORING_KEYS)[number]
export type ScoringTable = Record<ScoringKey, number>

export const DEFAULT_SCORING: Readonly<ScoringTable> = {
  appearance: 2, run: 1, four: 1, six: 2, fifty: 8, hundred: 16, duck: -3, wicket: 20, maiden: 6, threeWickets: 6, fiveWickets: 12, catch: 8, stumping: 12, runOut: 10,
}

/** Plain-English labels for the scoring table (the leaderboard disclosure and the season setup read these). */
export const SCORING_LABELS: Readonly<Record<ScoringKey, string>> = {
  appearance: 'Playing a game',
  run: 'Each run',
  four: 'Each four (when the scorer recorded fours)',
  six: 'Each six (when the scorer recorded sixes)',
  fifty: 'Reaching 50',
  hundred: 'Reaching 100 (on top of the 50 bonus)',
  duck: 'Out for a duck',
  wicket: 'Each wicket',
  maiden: 'Each maiden over',
  threeWickets: '3 wickets in an innings',
  fiveWickets: '5 wickets in an innings (on top of the 3 wicket bonus)',
  catch: 'Each catch',
  stumping: 'Each stumping (when recorded)',
  runOut: 'Each run-out (when recorded)',
}

export type FantasyRules = {
  maxEntries: number
  squadSize: number
  salaryCapTenths: number
  captainMultiplier: number
  /** 0 means unlimited. */
  transfersPerRound: number
  minPriceTenths: number
  maxPriceTenths: number
  priceSeasonsBack: number
  priorGames: number
  minGamesForPrice: number
  scoring: ScoringTable
}

export const DEFAULT_RULES: Readonly<FantasyRules> = {
  maxEntries: 300,
  squadSize: 11,
  salaryCapTenths: 1000,
  captainMultiplier: 2,
  transfersPerRound: 3,
  minPriceTenths: 40,
  maxPriceTenths: 140,
  priceSeasonsBack: 2,
  priorGames: 3,
  minGamesForPrice: 3,
  scoring: DEFAULT_SCORING,
}

/** The scalar rule fields stored on the season row (the table is the `scoring` group beside them). */
export const RULE_NUMBER_KEYS = ['maxEntries', 'squadSize', 'salaryCapTenths', 'captainMultiplier', 'transfersPerRound', 'minPriceTenths', 'maxPriceTenths', 'priceSeasonsBack', 'priorGames', 'minGamesForPrice'] as const

const whole = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : Number.NaN
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback
}

const RANGE: Record<(typeof RULE_NUMBER_KEYS)[number], [number, number]> = {
  maxEntries: [1, 5000], squadSize: [1, 15], salaryCapTenths: [10, 100000], captainMultiplier: [1, 5], transfersPerRound: [0, 15],
  minPriceTenths: [5, 1000], maxPriceTenths: [5, 1000], priceSeasonsBack: [1, 5], priorGames: [0, 20], minGamesForPrice: [0, 50],
}

/** A stored (possibly partial or old) season row as complete, in-range rules. Anything missing falls back to the default. */
export function resolveRules(raw: unknown): FantasyRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_RULES, scoring: { ...DEFAULT_SCORING } } as FantasyRules
  for (const k of RULE_NUMBER_KEYS) out[k] = whole(r[k], DEFAULT_RULES[k], RANGE[k][0], RANGE[k][1])
  if (out.maxPriceTenths < out.minPriceTenths) out.maxPriceTenths = out.minPriceTenths
  const s = (r.scoring && typeof r.scoring === 'object' ? r.scoring : {}) as Record<string, unknown>
  for (const k of SCORING_KEYS) out.scoring[k] = whole(s[k], DEFAULT_SCORING[k], -100, 200)
  return out
}

/** Credits for display: tenths as "100.0". */
export const credits = (tenths: number): string => (tenths / 10).toFixed(1)

export type SeasonStatus = 'draft' | 'open' | 'closed'
