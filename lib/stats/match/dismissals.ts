import type { BundleRows } from '@/lib/match-store/aggregate'
import type { MatchMinimums } from './minimums'
import { BOWLER_TYPES, DISMISSAL_KEYS, type BowlerType, type DismissalKey, type MatchCounts } from './types'

/** Labels for the dismissal charts. "Caught" is one segment: there is no keeper flag (W2 spec 2.3). */
export const DISMISSAL_LABELS: Record<DismissalKey | 'not_out' | 'not_recorded', string> = {
  bowled: 'Bowled', caught: 'Caught', caught_and_bowled: 'Caught and bowled', lbw: 'LBW', stumped: 'Stumped', run_out: 'Run out',
  hit_wicket: 'Hit wicket', retired_out: 'Retired out', other: 'Other', not_out: 'Not out', not_recorded: 'Not recorded',
}

export type DismissalSegment = { key: DismissalKey | 'not_out' | 'not_recorded'; label: string; count: number }

export type BatterDismissals = {
  segments: DismissalSegment[]
  /** Out innings, and how many of them have a recorded dismissal type (the share denominator). */
  outs: number
  recorded: number
  /** Not-out innings, and how many of those were a retirement (a footnote). */
  notOuts: number
  retiredNotOut: number
  /** Shares of recorded dismissals, null below `rateInnings` recorded dismissals. */
  bowledPct: number | null
  caughtPct: number | null
  lbwPct: number | null
  runOutLowConfidence: boolean
}

const pct = (n: number, d: number, min: number) => (d >= min && d > 0 ? (n / d) * 100 : null)

/** How a player was dismissed. Shares use only out innings with a recorded type; caught includes caught and bowled. */
export function batterDismissals(c: MatchCounts, min: Pick<MatchMinimums, 'rateInnings'>): BatterDismissals {
  const recorded = c.outs - c.dismissalsNotRecorded
  const segments: DismissalSegment[] = [
    ...DISMISSAL_KEYS.map((k) => ({ key: k, label: DISMISSAL_LABELS[k], count: c.dismissals[k] })),
    { key: 'not_recorded' as const, label: DISMISSAL_LABELS.not_recorded, count: c.dismissalsNotRecorded },
    { key: 'not_out' as const, label: DISMISSAL_LABELS.not_out, count: c.notOuts },
  ].filter((s) => s.count > 0)
  return {
    segments, outs: c.outs, recorded, notOuts: c.notOuts, retiredNotOut: c.retiredNotOut,
    bowledPct: pct(c.dismissals.bowled, recorded, min.rateInnings),
    caughtPct: pct(c.dismissals.caught + c.dismissals.caught_and_bowled, recorded, min.rateInnings),
    lbwPct: pct(c.dismissals.lbw, recorded, min.rateInnings),
    runOutLowConfidence: c.dismissals.run_out + c.dismissals.stumped > 0 && c.dismissals.run_out + c.dismissals.stumped < 5,
  }
}

export type BowlerDismissals = {
  segments: { key: BowlerType; label: string; count: number }[]
  total: number
  /** Wicket-taking innings that reconcile with the scorecard, of all wicket-taking innings. */
  reconciled: number
  wicketTakingInnings: number
}

/** How a bowler's wickets came; run outs and retirements are never credited to a bowler. */
export function bowlerDismissals(c: MatchCounts): BowlerDismissals {
  const segments = BOWLER_TYPES.map((k) => ({ key: k, label: DISMISSAL_LABELS[k], count: c.wicketsByType[k] })).filter((s) => s.count > 0)
  return { segments, total: segments.reduce((s, x) => s + x.count, 0), reconciled: c.reconciledWicketInnings, wicketTakingInnings: c.wicketTakingInnings }
}

/**
 * Run-outs and stumpings come from the `match-fielding` rows; the dismissal events cross-check them
 * (W2 spec 2.3). The first-fielder credit of a run out can never exceed the fielding row's run-outs,
 * and stumpings must agree exactly. A disagreement is reported as `fielding_mismatch:` and never repaired.
 * Only innings with bowling data are checked (a side with no data has no fielding rows at all).
 */
export function fieldingMismatches(b: Pick<BundleRows, 'innings' | 'batting' | 'fielding'>): string[] {
  const out: string[] = []
  const hasData = new Map(b.innings.map((i) => [i.sequenceNo, i.hasBowlingData]))
  const rowOf = new Map(b.fielding.map((f) => [`${f.inningsSeq}:${f.appearanceId}`, f]))
  const events = new Map<string, { runOuts: number; stumpings: number }>()
  for (const r of b.batting) {
    if (!r.fielderAppearanceId || (r.dismissalType !== 'run_out' && r.dismissalType !== 'stumped')) continue
    const k = `${r.inningsSeq}:${r.fielderAppearanceId}`
    const e = events.get(k) ?? { runOuts: 0, stumpings: 0 }
    if (r.dismissalType === 'run_out') e.runOuts++
    else e.stumpings++
    events.set(k, e)
  }
  for (const [k, e] of events) {
    const seq = Number(k.split(':')[0])
    if (!hasData.get(seq)) continue
    const row = rowOf.get(k)
    const rowRunOuts = row ? row.runOutsAssisted + row.runOutsUnassisted : 0
    const rowStumpings = row ? row.stumpings : 0
    if (e.runOuts > rowRunOuts) out.push(`fielding_mismatch:run_out events ${e.runOuts} above fielding row ${rowRunOuts} (innings ${seq})`)
    if (e.stumpings !== rowStumpings) out.push(`fielding_mismatch:stumped events ${e.stumpings} differ from fielding row ${rowStumpings} (innings ${seq})`)
  }
  // A fielding row with stumpings but no stumped event is also a disagreement.
  for (const f of b.fielding) {
    const k = `${f.inningsSeq}:${f.appearanceId}`
    if (f.stumpings > 0 && !events.get(k)?.stumpings && hasData.get(f.inningsSeq)) out.push(`fielding_mismatch:stumpings ${f.stumpings} on fielding row without a stumped event (innings ${f.inningsSeq})`)
  }
  return out
}
