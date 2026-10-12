import { SOCIAL_MAX_ATTEMPTS } from '@/config/site'

/**
 * Post and target states and the rules between them (wave C spec 4.4). Pure and exhaustive: the actions and the publisher check
 * `canMove` before they write, and `derivePostStatus` is the only place a post's status is worked out from its targets.
 */
export const POST_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed'] as const
export type PostStatus = (typeof POST_STATUSES)[number]
export const TARGET_STATUSES = ['pending', 'publishing', 'published', 'failed', 'unknown'] as const
export type TargetStatus = (typeof TARGET_STATUSES)[number]

export const isPostStatus = (v: unknown): v is PostStatus => typeof v === 'string' && (POST_STATUSES as readonly string[]).includes(v)

/** Every legal move of a post, by name. Anything else is refused. */
export const POST_MOVES = {
  schedule: { from: ['draft'], to: 'scheduled' },
  pause: { from: ['scheduled'], to: 'draft' },
  claim: { from: ['scheduled'], to: 'publishing' },
  /** A claimed post whose lease ran out is claimed again. */
  reclaim: { from: ['publishing'], to: 'publishing' },
  finish: { from: ['publishing'], to: ['published', 'failed', 'scheduled'] },
  retry: { from: ['failed'], to: 'scheduled' },
  /** A person marks the last open target as posted, or checks that it did not go out. */
  resolve: { from: ['failed', 'scheduled'], to: ['published', 'failed', 'scheduled'] },
  /** Edits: a draft directly; a scheduled post is paused first, so it is the pause move that matters. */
  edit: { from: ['draft'], to: 'draft' },
  remove: { from: ['draft', 'published', 'failed'], to: null },
} as const
export type PostMove = keyof typeof POST_MOVES

export function canMove(move: PostMove, from: PostStatus, to?: PostStatus): boolean {
  const rule = POST_MOVES[move]
  if (!(rule.from as readonly string[]).includes(from)) return false
  if (to === undefined || rule.to === null) return true
  return ((Array.isArray(rule.to) ? rule.to : [rule.to]) as readonly string[]).includes(to)
}

/** A person may edit or pause only while no target has been tried yet. */
export const untouched = (targets: readonly { status: TargetStatus }[]): boolean => targets.every((t) => t.status === 'pending')

export type TargetFacts = { status: TargetStatus; attempts: number; nextAttemptAt: Date | null }
export type DerivedPost = { status: 'published' | 'failed' | 'scheduled'; /** When the post may next be claimed (scheduled only). */ nextRunAt: Date | null }

/**
 * The post's state from its targets once a run is over. Every target published is `published`. A target still `pending` (it failed
 * in a way that can be retried, and attempts remain) keeps the post `scheduled` for the earliest of those retry times. Otherwise
 * something failed or is `unknown`, and a person has to look: `failed`. A target still `publishing` cannot be told apart from a lost
 * run, so it counts as `unknown`.
 */
export function derivePostStatus(targets: readonly TargetFacts[], now: Date, maxAttempts = SOCIAL_MAX_ATTEMPTS): DerivedPost {
  if (targets.length === 0) return { status: 'failed', nextRunAt: null }
  if (targets.every((t) => t.status === 'published')) return { status: 'published', nextRunAt: null }
  const retrying = targets.filter((t) => t.status === 'pending' && t.attempts < maxAttempts)
  if (retrying.length > 0) {
    const times = retrying.map((t) => (t.nextAttemptAt ?? now).getTime())
    return { status: 'scheduled', nextRunAt: new Date(Math.min(...times)) }
  }
  return { status: 'failed', nextRunAt: null }
}
