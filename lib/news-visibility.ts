import type { Where } from 'payload'

/**
 * The one definition of "a news post the public may see": published, and its date has come. Used by the
 * collection read rule (REST) and every public query (Local API ignores access rules). `now` is taken per call.
 */
export const publishedNow = (now: Date = new Date()): { and: Where[] } => ({
  and: [{ status: { equals: 'published' } }, { publishedAt: { less_than_equal: now.toISOString() } }],
})
