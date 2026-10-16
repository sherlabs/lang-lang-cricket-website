import { countsByPlayer } from './counts'
import { coverageCaption, coverageOf } from './coverage'
import { matchQualifierText, rankMatchBy, type MatchMetric } from './metrics'
import type { MatchMinimums } from './minimums'
import type { FactSet, MatchCounts } from './types'

export const SMALL_SAMPLE_NOTE = 'Based on a small number of recorded events.'

/**
 * Run outs and stumpings have not yet been seen in real PlayHQ data (W2 spec rule 0.7), so a board built on
 * fewer than five recorded events says so.
 */
export function smallEventSample(metric: { key: string }, counts: readonly MatchCounts[]): boolean {
  if (metric.key !== 'runOuts' && metric.key !== 'stumpings') return false
  const n = counts.reduce((s, c) => s + c.runOuts + c.stumpings, 0)
  return n > 0 && n < 5
}

/** The extra column beside a match leaderboard value: innings for batting and bowling, games otherwise. */
export function matchBoardContext(metric: MatchMetric): { label: string; text: (c: MatchCounts) => string } {
  if (metric.group === 'batting') return { label: 'Inns', text: (c) => String(c.battingInnings) }
  if (metric.group === 'bowling') return { label: 'Inns', text: (c) => String(c.bowlingInnings) }
  if (metric.group === 'fielding') return { label: 'Games', text: (c) => String(c.games) }
  return { label: 'Games', text: (c) => String(c.games) }
}

export type MatchBoard = {
  ranked: { rank: number; playerId: number; display: string; context: string }[]
  unqualified: { playerId: number; display: string }[]
  total: number
  /** Qualification sentence, or null for a count board. */
  note: string | null
  /** "From match data. From <date>, N games stored. K of M innings have <need>." */
  source: string
}

/** One match-data leaderboard over a (filtered) fact set. Pure. */
export function buildMatchBoard(set: FactSet, metric: MatchMetric, min: MatchMinimums): MatchBoard {
  const items = [...countsByPlayer(set)].map(([playerId, counts]) => ({ playerId, counts }))
  const { ranked, unqualified } = rankMatchBy(items, metric, min)
  const ctx = matchBoardContext(metric)
  const need = metric.needs ?? undefined
  return {
    ranked: ranked.map((r) => ({ rank: r.rank, playerId: r.item.playerId, display: r.display, context: ctx.text(r.item.counts) })),
    unqualified: unqualified.map((u) => ({ playerId: u.playerId, display: metric.format(u.counts) })),
    total: ranked.length,
    note: matchQualifierText(metric.qualifier, min),
    source: `From match data. ${coverageCaption(coverageOf(set), need)} ${metric.help}${smallEventSample(metric, items.map((i) => i.counts)) ? ` ${SMALL_SAMPLE_NOTE}` : ''}`,
  }
}
