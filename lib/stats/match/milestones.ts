import type { MatchCounts } from './types'

/**
 * Match-data milestone counters (W2 spec 4.2). They are explicitly "since the first stored match":
 * there is no baseline field for them, so they are never merged into the games, runs, wickets and
 * catches milestones (which have baselines) and never claim lifetime totals.
 */
export type MatchMilestoneKey = 'fifties' | 'hundreds' | 'fiveFors'
export const MATCH_MILESTONE_KEYS: readonly MatchMilestoneKey[] = ['fifties', 'hundreds', 'fiveFors']
export const MATCH_MILESTONE_THRESHOLDS: Record<MatchMilestoneKey, readonly number[]> = {
  fifties: [1, 5, 10, 25],
  hundreds: [1, 2, 5],
  fiveFors: [1, 3, 5],
}
const UNITS: Record<MatchMilestoneKey, [string, string]> = { fifties: ['fifty', 'fifties'], hundreds: ['hundred', 'hundreds'], fiveFors: ['five-wicket haul', 'five-wicket hauls'] }

const COUNT: Record<MatchMilestoneKey, (c: MatchCounts) => number> = { fifties: (c) => c.fifties, hundreds: (c) => c.hundreds, fiveFors: (c) => c.fiveFors }

export type MatchMilestone = { key: MatchMilestoneKey; threshold: number; count: number; label: string }

/** "5 fifties", "1 hundred". */
export const matchMilestoneName = (key: MatchMilestoneKey, n: number): string => `${n} ${UNITS[key][n === 1 ? 0 : 1]}`

/** The highest threshold reached per key. The label states the real count ("3 fifties"), not the threshold, and the caller adds "since <date>". */
export function matchMilestonesFor(c: MatchCounts): MatchMilestone[] {
  const out: MatchMilestone[] = []
  for (const key of MATCH_MILESTONE_KEYS) {
    const count = COUNT[key](c)
    const reached = MATCH_MILESTONE_THRESHOLDS[key].filter((t) => count >= t)
    const top = reached[reached.length - 1]
    if (top !== undefined) out.push({ key, threshold: top, count, label: matchMilestoneName(key, count) })
  }
  return out
}

export type MatchMilestoneCrossing = MatchMilestone & { playerId: number; previous: number }

/**
 * Milestones crossed between two cumulative snapshots: `before` is the totals up to the start of the
 * period (null or missing = zero), `now` the totals including it. Sorted by threshold, biggest first.
 */
export function matchMilestonesCrossed(now: ReadonlyMap<number, MatchCounts>, before: ReadonlyMap<number, MatchCounts>): MatchMilestoneCrossing[] {
  const out: MatchMilestoneCrossing[] = []
  for (const [playerId, c] of now) {
    const b = before.get(playerId)
    for (const key of MATCH_MILESTONE_KEYS) {
      const count = COUNT[key](c), previous = b ? COUNT[key](b) : 0
      const crossed = MATCH_MILESTONE_THRESHOLDS[key].filter((t) => count >= t && previous < t)
      const top = crossed[crossed.length - 1]
      if (top !== undefined) out.push({ key, threshold: top, count, previous, playerId, label: matchMilestoneName(key, top) })
    }
  }
  return out.sort((a, b) => b.threshold - a.threshold || a.playerId - b.playerId)
}
