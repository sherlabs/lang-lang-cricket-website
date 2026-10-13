import { INSIGHTS } from '@/config/site'
import type { GameView } from './games'

/**
 * Win margins for games that went one innings each (wave E, WP-3, spec 5.4). A runs margin applies when the winner batted
 * first, wickets in hand when the winner chased. Who batted first comes from the stored innings order. Anything else (a
 * multi-innings game, an imported game with no totals, a forfeit, a draw, an order we cannot trust) is counted as
 * "margin not comparable" with a reason, never guessed.
 */
export type Margin = { kind: 'runs' | 'wickets'; value: number; clubWon: boolean }
export type NotComparable = 'forfeit' | 'no_winner' | 'innings_count' | 'order' | 'no_totals' | 'inconsistent'
export type MarginResult = { margin: Margin } | { notComparable: NotComparable }

export const NOT_COMPARABLE_TEXT: Record<NotComparable, string> = {
  forfeit: 'forfeits',
  no_winner: 'draws, ties and no results',
  innings_count: 'games with more than one innings each',
  order: 'games where the innings order is not recorded clearly',
  no_totals: 'games stored without team totals',
  inconsistent: 'games whose totals do not fit the recorded result',
}

export function marginOf(g: GameView, wicketsInHand: number = INSIGHTS.wicketsInHand): MarginResult {
  if (g.header.forfeit) return { notComparable: 'forfeit' }
  if (g.outcome !== 'won' && g.outcome !== 'lost') return { notComparable: 'no_winner' }
  if (g.innings.length !== 2) return { notComparable: 'innings_count' }
  if (g.battedFirst === null || g.header.firstInnings) return { notComparable: 'order' }
  const [first, second] = g.innings
  if (first.runs === null || second.runs === null) return { notComparable: 'no_totals' }
  const clubWon = g.outcome === 'won'
  const winnerBattedFirst = clubWon === g.battedFirst
  if (winnerBattedFirst) {
    const value = first.runs - second.runs
    return value > 0 ? { margin: { kind: 'runs', value, clubWon } } : { notComparable: 'inconsistent' }
  }
  if (second.wickets === null || second.runs <= first.runs) return { notComparable: second.wickets === null ? 'no_totals' : 'inconsistent' }
  const value = wicketsInHand - second.wickets
  return value > 0 ? { margin: { kind: 'wickets', value, clubWon } } : { notComparable: 'inconsistent' }
}

export type Bucket = { label: string; count: number }

/** Bucket labels for the upper bounds: `[20, 60]` gives "1 to 20", "21 to 60", "61 or more". */
export function bucketLabels(bounds: readonly number[], unit: string): string[] {
  const labels: string[] = []
  let lo = 1
  for (const hi of bounds) {
    labels.push(`${lo} to ${hi} ${unit}`)
    lo = hi + 1
  }
  labels.push(`${lo} or more ${unit}`)
  return labels
}

export function bucketize(values: readonly number[], bounds: readonly number[], unit: string): Bucket[] {
  const labels = bucketLabels(bounds, unit)
  const counts = labels.map(() => 0)
  for (const v of values) {
    const i = bounds.findIndex((hi) => v <= hi)
    counts[i === -1 ? bounds.length : i]++
  }
  return labels.map((label, i) => ({ label, count: counts[i] }))
}

export type MarginGroup = { n: number; /** Null below the minimum: the raw count shows instead. */ buckets: Bucket[] | null }
export type MarginSummary = {
  wins: { runs: MarginGroup; wickets: MarginGroup }
  losses: { runs: MarginGroup; wickets: MarginGroup }
  /** Games with a result that could not be bucketed, by reason. */
  notComparable: Partial<Record<NotComparable, number>>
  notComparableTotal: number
}

export function marginSummary(games: readonly GameView[], minGames: number = INSIGHTS.teamMinGames, cfg: Pick<typeof INSIGHTS, 'marginBuckets' | 'wicketsInHand'> = INSIGHTS): MarginSummary {
  const got: Record<'wins' | 'losses', Record<'runs' | 'wickets', number[]>> = { wins: { runs: [], wickets: [] }, losses: { runs: [], wickets: [] } }
  const nc: Partial<Record<NotComparable, number>> = {}
  let ncTotal = 0
  for (const g of games) {
    const r = marginOf(g, cfg.wicketsInHand)
    if ('margin' in r) got[r.margin.clubWon ? 'wins' : 'losses'][r.margin.kind].push(r.margin.value)
    // A draw, tie or no result is not a "margin missing"; only decided or forfeited games are listed as not comparable.
    else if (r.notComparable !== 'no_winner') {
      nc[r.notComparable] = (nc[r.notComparable] ?? 0) + 1
      ncTotal++
    }
  }
  const group = (values: number[], bounds: readonly number[], unit: string): MarginGroup => ({ n: values.length, buckets: values.length >= minGames ? bucketize(values, bounds, unit) : null })
  const side = (s: 'wins' | 'losses') => ({ runs: group(got[s].runs, cfg.marginBuckets.runs, 'runs'), wickets: group(got[s].wickets, cfg.marginBuckets.wickets, 'wickets') })
  return { wins: side('wins'), losses: side('losses'), notComparable: nc, notComparableTotal: ncTotal }
}
