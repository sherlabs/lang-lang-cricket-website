import { revalidatePaths } from '../../payload/hooks/revalidate'

/**
 * Cache tags for every stats cache. A match-derived cache and a season-total cache must expire
 * together (a hide, merge, grade-rule change or sync moves both), so every stats cache carries
 * both tags and nothing passes a bare tag literal to `revalidatePaths`.
 */
export const STATS_TAG = 'player-stats'
export const MATCH_STORE_TAG = 'match-store'
export const ALL_STATS_TAGS = [STATS_TAG, MATCH_STORE_TAG] as const

/** Expire every stats cache, and optionally revalidate pages (errors outside a Next request are swallowed). */
export async function revalidateStats(paths: readonly string[] = []): Promise<void> {
  await revalidatePaths(paths, undefined, ALL_STATS_TAGS)
}
