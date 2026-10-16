import { SOCIAL_MAX_ATTEMPTS } from '@/config/site'
import type { QueuePost } from '@/lib/social-queries'
import { needsFallback, postChip, targetLine, tabOf, type Chip, type Tab } from './queue-view'
import { SIZES, isSizeKey } from './types'

/** One row of the queue as the page draws it: all words already worked out, so the client component only shows them. */
export type QueueTargetView = {
  id: number
  network: string
  label: string
  size: string
  sizeLabel: string
  status: string
  line: string
  fallback: boolean
  finalText: string
  canMarkPosted: boolean
  canMarkNotPosted: boolean
}
export type QueueRowView = {
  id: number
  title: string
  tab: Tab
  status: string
  chip: Chip
  when: string
  caption: string
  /** The size of the first network's picture, or square, for the row's thumbnail. */
  thumbSize: string
  targets: QueueTargetView[]
  canEdit: boolean
  canPause: boolean
  canPostNow: boolean
  canRetry: boolean
  canDelete: boolean
  hasUnknown: boolean
}

export function toRow(post: QueuePost, o: { labels: Record<string, string>; available: ReadonlySet<string>; clock: (iso: string) => string; when: (iso: string) => string }): QueueRowView {
  const targets = post.targets.map((t): QueueTargetView => {
    const label = o.labels[t.network] ?? t.network
    return {
      id: t.id, network: t.network, label, size: t.size, sizeLabel: isSizeKey(t.size) ? SIZES[t.size].label : t.size,
      status: t.status, line: targetLine(t, { label, maxAttempts: SOCIAL_MAX_ATTEMPTS, clock: o.clock }),
      fallback: post.status !== 'draft' && needsFallback(t, o.available.has(t.network)),
      finalText: t.finalText || post.caption,
      canMarkPosted: (t.status === 'failed' || t.status === 'unknown') && post.status !== 'publishing',
      canMarkNotPosted: t.status === 'unknown' && post.status !== 'publishing',
    }
  })
  const at = post.status === 'published' || post.status === 'failed' ? post.finishedAt : post.scheduledFor
  return {
    id: post.id, title: post.title, tab: tabOf({ status: post.status, targets: post.targets }), status: post.status, chip: postChip(post.status),
    when: at ? o.when(at) : 'No time chosen', caption: post.caption, thumbSize: post.targets.find((t) => isSizeKey(t.size))?.size ?? 'square', targets,
    canEdit: post.status === 'draft' || (post.status === 'scheduled' && post.targets.every((t) => t.status === 'pending')),
    canPause: post.status === 'scheduled' && post.targets.every((t) => t.status === 'pending'),
    canPostNow: post.status === 'scheduled',
    canRetry: post.status === 'failed' && !post.targets.some((t) => t.status === 'unknown'),
    canDelete: post.status === 'draft' || post.status === 'published' || post.status === 'failed',
    hasUnknown: post.targets.some((t) => t.status === 'unknown'),
  }
}
