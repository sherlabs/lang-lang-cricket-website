import { toCsv } from '@/lib/stats/csv'
import type { BoardRow } from './tally'

/** Season totals per player, never individual ballots (wave B spec 3.5). Goes through the shared formula-injection guard. */
export function votesCsv(rows: readonly BoardRow[], values: readonly number[], meta: { scope: string; season: string }): string {
  const header = ['Rank', 'Shared', 'Player', 'Points', ...values.map((v, i) => `Place ${i + 1} (${v})`), 'Ballots naming player', 'Games', 'Ballot values used', 'Scope', 'Season']
  const label = values.join('-')
  return toCsv(header, rows.map((r) => [r.rank, r.shared ? 'yes' : 'no', r.name, r.points, ...values.map((_, i) => r.counts[i] ?? 0), r.ballots, r.games, label, meta.scope, meta.season]))
}
