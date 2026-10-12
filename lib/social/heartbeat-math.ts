/**
 * The scheduler's check-in (wave C spec 4.7). The app never claims a frequency from configuration: it records when the cron route
 * last ran and the gap it saw, and reports only that. Pure helpers for the numbers and the words.
 */
const MIN_INTERVAL = 1
/** Without an observed interval, a post is "overdue" after this many minutes. */
export const OVERDUE_FLOOR_MINUTES = 30

/** Smooth the gap between runs: half the old figure, half the new, never below a minute. The first run sets none. */
export function smoothInterval(previous: number | null, gapMinutes: number | null): number | null {
  if (gapMinutes === null || !Number.isFinite(gapMinutes) || gapMinutes < 0) return previous
  const gap = Math.max(MIN_INTERVAL, Math.round(gapMinutes))
  return previous === null ? gap : Math.max(MIN_INTERVAL, Math.round((previous + gap) / 2))
}

/** Minutes after which a scheduled post counts as overdue: twice the observed interval, or the floor when none is known. */
export const overdueAfterMinutes = (observed: number | null): number => (observed && observed > 0 ? observed * 2 : OVERDUE_FLOOR_MINUTES)

export function ago(from: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - from.getTime()) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${days} days ago`
}

export type HeartbeatView = { lastChecked: string; warning: string | null; cadence: string | null }

export function heartbeatView(o: { lastRunAt: Date | null; observedMinutes: number | null; scheduledCount: number; overdueCount: number; now: Date }): HeartbeatView {
  const lastChecked = o.lastRunAt ? `Last checked ${ago(o.lastRunAt, o.now)}` : 'Not checked yet'
  const limit = overdueAfterMinutes(o.observedMinutes)
  const stale = o.lastRunAt !== null && (o.now.getTime() - o.lastRunAt.getTime()) / 60_000 > limit
  const warn = o.overdueCount > 0 || (o.scheduledCount > 0 && stale)
  const warning = warn
    ? `Scheduled posts are not going out. The scheduler ${o.lastRunAt ? `last checked ${ago(o.lastRunAt, o.now)}` : 'has not checked yet'}. Download and post by hand, or ask whoever manages the website.`
    : null
  const cadence = o.observedMinutes
    ? `Posts go out when the scheduler next checks, about every ${o.observedMinutes >= 120 ? `${Math.round(o.observedMinutes / 60)} hours` : `${o.observedMinutes} ${o.observedMinutes === 1 ? 'minute' : 'minutes'}`}.`
    : null
  return { lastChecked, warning, cadence }
}
