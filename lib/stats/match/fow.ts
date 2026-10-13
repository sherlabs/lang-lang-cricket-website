import { type PartnershipReason } from './types'

/**
 * The team score at each wicket of one innings, from the stored fall of wickets (wave E, WP-4). Pure. The same honesty rules as
 * the partnerships: an innings counts only when the wicket numbers run 1..n with no gap, the runs never decrease, the count
 * equals the recorded wickets and no score is above the innings total. Otherwise it is rejected with the partnership reason code
 * (never repaired), and an innings with no fall of wickets at all is not a rejection, just absent. A score is a team score at a
 * wicket, never an over: PlayHQ gives no over for a wicket.
 */
export type FowInput = {
  hasFow: boolean
  totalRuns: number | null
  totalWickets: number | null
  /** One entry per dismissed batter that has a fall-of-wicket figure (`fowWicket`, `fowRuns`); any order. */
  entries: readonly { fowWicket: number | null; fowRuns: number | null }[]
}
export type FowResult = { fow: number[] | null; reject: PartnershipReason | null }

export function deriveFow(input: FowInput): FowResult {
  if (!input.hasFow) return { fow: null, reject: null }
  const found = input.entries.filter((e): e is { fowWicket: number; fowRuns: number | null } => e.fowWicket !== null)
  const sorted = [...found].sort((a, b) => a.fowWicket - b.fowWicket)
  if (sorted.length === 0) return { fow: null, reject: null }
  if (sorted.some((e, i) => e.fowWicket !== i + 1)) return { fow: null, reject: 'fow_gap' }
  if (sorted.length !== input.totalWickets) return { fow: null, reject: 'total_mismatch' }
  let prev = 0
  for (const e of sorted) {
    if (e.fowRuns === null || !Number.isFinite(e.fowRuns) || e.fowRuns < prev) return { fow: null, reject: 'fow_runs_decrease' }
    prev = e.fowRuns
  }
  if (input.totalRuns !== null && prev > input.totalRuns) return { fow: null, reject: 'total_mismatch' }
  return { fow: sorted.map((e) => e.fowRuns as number), reject: null }
}
