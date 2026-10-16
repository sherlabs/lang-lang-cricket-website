import { plainReason, UNKNOWN_TEXT } from './reasons'

/**
 * The queue's words (wave C spec 3.5, 4.8). Pure: the page loads the facts, this decides what a person reads. Internal state names
 * stay in code; the screen says "Scheduled", "Posting now", "Posted", "Did not post".
 */
export type Tab = 'attention' | 'scheduled' | 'posted' | 'drafts'
export const TABS: { key: Tab; label: string }[] = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'posted', label: 'Posted' },
  { key: 'drafts', label: 'Drafts' },
]
/** The words under an empty sub-tab of the Posts tab. */
export const queueEmptyText = (tab: Tab): string =>
  ({ attention: 'Nothing needs your attention.', scheduled: 'No posts are scheduled.', posted: 'Nothing has been posted yet.', drafts: 'No drafts.' })[tab]

export const isTab = (v: unknown): v is Tab => TABS.some((t) => t.key === v)

export type Chip = { icon: string; label: string; tone: 'ok' | 'warn' | 'info' | 'idle' }

/** Icon plus word, never colour alone. */
export function postChip(status: string): Chip {
  switch (status) {
    case 'scheduled': return { icon: '◷', label: 'Scheduled', tone: 'info' }
    case 'publishing': return { icon: '…', label: 'Posting now', tone: 'info' }
    case 'published': return { icon: '✓', label: 'Posted', tone: 'ok' }
    case 'failed': return { icon: '!', label: 'Did not post', tone: 'warn' }
    default: return { icon: '✎', label: 'Draft', tone: 'idle' }
  }
}

type TargetFacts = { status: string; attempts: number; nextAttemptAt: string | null; errorCode: string | null; lastError: string | null; manual: boolean }

export function targetLine(t: TargetFacts, o: { label: string; maxAttempts: number; clock: (iso: string) => string }): string {
  switch (t.status) {
    case 'published': return t.manual ? `${o.label}: posted by hand` : `${o.label}: posted`
    case 'publishing': return `${o.label}: posting now`
    case 'unknown': return `${o.label}: ${UNKNOWN_TEXT}`
    case 'failed': return `${o.label}: did not post: ${plainReason(t.errorCode, t.lastError)}`
    default:
      return t.attempts > 0 && t.nextAttemptAt
        ? `${o.label}: did not post, will retry at ${o.clock(t.nextAttemptAt)} (attempt ${t.attempts} of ${o.maxAttempts})`
        : `${o.label}: waiting to post`
  }
}

export function tabOf(post: { status: string; targets: readonly { status: string }[] }): Tab {
  if (post.status === 'failed' || post.targets.some((t) => t.status === 'unknown' || t.status === 'failed')) return 'attention'
  if (post.status === 'scheduled' || post.status === 'publishing') return 'scheduled'
  if (post.status === 'published') return 'posted'
  return 'drafts'
}

/** The fallback is always offered for a target that did not go out, or whose network is not available. */
export const needsFallback = (target: { status: string }, networkAvailable: boolean): boolean => target.status !== 'published' && (target.status === 'failed' || target.status === 'unknown' || !networkAvailable)

export const NOT_AVAILABLE = (label: string): string => `${label} is not available yet. Download the picture and post it by hand.`
