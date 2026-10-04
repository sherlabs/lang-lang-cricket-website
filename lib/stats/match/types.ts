import type { DismissalType, MatchResult } from '@/lib/playhq/match-rows'

/**
 * Facts derived from stored matches (W2 spec section 2 and 4.1). Plain data, no database and no Next.
 * Rows point at their match by `m` (the stored match id) and at an innings by `(m, seq)`. A player id
 * appears only for a visible (non-hidden, resolved) club player: a hidden or unresolved club row
 * never reaches a fact, except as `null` inside a partnership.
 */
export type BatStatus = 'out' | 'not_out' | 'unknown'

export type MatchHeader = {
  id: number
  gameId: string
  /** `yyyy-mm-dd` local date, null when unknown. */
  date: string | null
  seasonName: string
  seasonStartYear: number | null
  grade: string | null
  team: string
  format: string
  result: MatchResult | null
  forfeit: boolean
  firstInnings: boolean
  /** `oppositionKey` of the other side. */
  oppKey: string
  oppLabel: string
}

export const PARTNERSHIP_REASONS = [
  'no_fow', 'retirement', 'bad_position', 'fow_gap', 'fow_missing_for_out', 'fow_runs_decrease', 'crease_mismatch', 'total_mismatch',
] as const
export type PartnershipReason = (typeof PARTNERSHIP_REASONS)[number]

/** One played innings of a stored match (club side batting or bowling). */
export type InningsMeta = {
  m: number
  seq: number
  clubBatting: boolean
  declared: boolean
  allOut: boolean
  /** Null for an imported game with no team total (encoded as -1). */
  runs: number | null
  wickets: number | null
  hasFow: boolean
  hasBowling: boolean
  hasBall: boolean
  /** Club batting innings only: `ok` when partnerships were derived, else why not. Null for a club bowling innings. */
  partnerships: 'ok' | PartnershipReason | null
}

export type Appearance = { m: number; player: number }

export type BatFact = {
  m: number
  seq: number
  player: number
  /** The scorer's card order (`displayOrder`), not proof of arrival order. 0 means "no data". */
  pos: number
  status: BatStatus
  runs: number
  balls: number | null
  fours: number | null
  sixes: number | null
  dismissal: DismissalType | null
}

/** Wickets credited to the bowler by type, from the opposition batters' dismissal events. */
export const BOWLER_TYPES = ['bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'hit_wicket'] as const
export type BowlerType = (typeof BOWLER_TYPES)[number]

export type BowlFact = {
  m: number
  seq: number
  player: number
  balls: number
  maidens: number
  runs: number
  wickets: number
  /** True when the dismissals credited to this bowler equal `wickets` (the scorecard agrees with the events). */
  reconciled: boolean
  byType: Record<BowlerType, number>
}

export type CreditFact = {
  m: number
  seq: number
  player: number
  /** Caught by the fielder, plus caught and bowled by the bowler (the W1 rule). */
  catches: number
  /** Null when the player has no `match-fielding` row in this innings. */
  keeperCatches: number | null
  runOuts: number | null
  stumpings: number | null
}

export type PartnershipFact = {
  m: number
  seq: number
  wicket: number
  runs: number
  /** Visible club player ids; null for a hidden or unresolved partner. */
  a: number | null
  b: number | null
  unbroken: boolean
}

/** Everything one set of stored matches yields, ready to filter, split by player and count. */
export type FactSet = {
  matches: Map<number, MatchHeader>
  innings: Map<string, InningsMeta>
  appearances: Appearance[]
  bat: BatFact[]
  bowl: BowlFact[]
  credits: CreditFact[]
  partnerships: PartnershipFact[]
  /** Set when the set holds only the newest `kept` of `total` stored seasons (a request cap), so captions can say so. */
  seasonCap?: { kept: number; total: number }
}

export const inningsKey = (m: number, seq: number) => `${m}:${seq}`

export const emptyFactSet = (): FactSet => ({ matches: new Map(), innings: new Map(), appearances: [], bat: [], bowl: [], credits: [], partnerships: [] })

export type DismissalKey = 'bowled' | 'caught' | 'caught_and_bowled' | 'lbw' | 'stumped' | 'run_out' | 'hit_wicket' | 'retired_out' | 'other'
export const DISMISSAL_KEYS: readonly DismissalKey[] = ['bowled', 'caught', 'caught_and_bowled', 'lbw', 'stumped', 'run_out', 'hit_wicket', 'retired_out', 'other']

/** Per-player derived counts. Denominators are carried so a rate is never computed over missing rows. */
export type MatchCounts = {
  games: number
  /** Non-forfeit games the player's side won. */
  wins: number
  /** Non-forfeit games with a result of won, lost, draw or tie (the win percentage denominator). */
  resultGames: number
  battingInnings: number
  outs: number
  notOuts: number
  runs: number
  fifties: number
  hundreds: number
  ducks: number
  goldenDucks: number
  /** Ducks whose row has a recorded `balls` (golden ducks are only decidable for these). */
  ducksWithBalls: number
  /** Rows with recorded balls, and the balls and runs of those rows (strike rate, ball-based figures). */
  ballInnings: number
  ballsFaced: number
  runsOnBalls: number
  /** Rows with balls, fours and sixes all recorded: runs, boundaries and balls of those rows. */
  boundaryInnings: number
  boundaryRuns: number
  boundaryBalls: number
  boundaries: number
  /** Dismissal tally of out innings: a recorded type per key, plus out innings with no recorded type. */
  dismissals: Record<DismissalKey, number>
  dismissalsNotRecorded: number
  retiredNotOut: number
  /** Position figures (as scored): sum and count of positions above 0, and rows excluded for position 0. */
  positionSum: number
  positionCount: number
  positionExcluded: number
  /** Bowling, from innings with bowling figures only. */
  bowlingInnings: number
  bowlBalls: number
  bowlRuns: number
  wickets: number
  threeFors: number
  fiveFors: number
  tenWicketMatches: number
  /** Games where ten could not be decided (an innings the side bowled has no bowling figures). */
  tenWicketUndecided: number
  /** Wickets by type, over the innings whose credited dismissals reconcile with the scorecard. */
  wicketsByType: Record<BowlerType, number>
  reconciledWicketInnings: number
  wicketTakingInnings: number
  /** Fielding. Run-outs, stumpings and keeper catches count only innings with a fielding row. */
  catches: number
  runOuts: number
  stumpings: number
  keeperCatches: number
  fieldingInnings: number
}
