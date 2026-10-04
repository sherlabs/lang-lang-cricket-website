import type { Payload } from 'payload'
import { combineCounts, countsFromStats, type SeasonCounts } from '@/lib/players/season-math'
import type { TeamAggregate } from '@/lib/players/plan'
import { collectPlayerRows, compareCounts, type CountMismatch } from './aggregate'
import { readStoredBundles } from './read'
import type { AliasMap } from './write'

/**
 * Nightly reconciliation (WP-M, spec M3): the stored match rows, read back and aggregated, must equal
 * the season counts the sync planned, per (resolved player, team, season), after alias resolution.
 * `expected` holds only games that produced a stored match, so skipped games are excluded on both
 * sides; a (team, season) containing a game whose write failed is skipped (`skipPairs`).
 */

export type ReconcileSummary = { pairsCompared: number; pairsSkipped: number; playersCompared: number; mismatchedPlayers: number; catchesSkippedSameName: number; samples: CountMismatch[] }

export const pairKey = (teamId: string, seasonName: string) => `${teamId}|${seasonName}`

export function expectedCounts(aggregate: TeamAggregate, aliasMap: AliasMap): Map<string, SeasonCounts> {
  const out = new Map<string, SeasonCounts>()
  for (const s of aggregate.stats) {
    const player = aliasMap.get(s.key.trim())
    if (player === undefined) continue
    const key = String(player)
    const counts = countsFromStats(s)
    out.set(key, out.has(key) ? combineCounts(out.get(key)!, counts) : counts)
  }
  return out
}

export async function reconcileMatchStore(
  payload: Payload,
  input: { aggregates: TeamAggregate[]; aliasMap: AliasMap; skipPairs: ReadonlySet<string> },
): Promise<ReconcileSummary> {
  const stored = await readStoredBundles(payload)
  const byPair = new Map<string, typeof stored>()
  for (const b of stored) byPair.set(pairKey(b.match.clubTeamId, b.match.seasonName), [...(byPair.get(pairKey(b.match.clubTeamId, b.match.seasonName)) ?? []), b])
  const summary: ReconcileSummary = { pairsCompared: 0, pairsSkipped: 0, playersCompared: 0, mismatchedPlayers: 0, catchesSkippedSameName: 0, samples: [] }
  for (const agg of input.aggregates) {
    const key = pairKey(agg.teamId, agg.seasonName)
    if (input.skipPairs.has(key)) {
      summary.pairsSkipped++
      continue
    }
    const derived = collectPlayerRows(byPair.get(key) ?? [], agg.teamId, (a) => {
      const p = a.nameKey ? input.aliasMap.get(a.nameKey) : undefined
      return p === undefined ? null : String(p)
    })
    const result = compareCounts(expectedCounts(agg, input.aliasMap), derived)
    summary.pairsCompared++
    summary.playersCompared += result.compared
    summary.catchesSkippedSameName += result.catchesSkippedSameName
    summary.mismatchedPlayers += new Set(result.mismatches.map((m) => m.key)).size
    for (const m of result.mismatches) if (summary.samples.length < 10) summary.samples.push(m)
  }
  return summary
}
