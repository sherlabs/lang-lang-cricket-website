import { notificationCopy as copy } from '../../payload/admin/copy'

/**
 * The lines on the admin Home page (W2 spec 6.4, issue #11). Pure: the dashboard loads the facts, this decides the words.
 * No new computation: it only reports what already exists (the latest sync run, the approvals queue, the duplicate
 * suggestion count and the import log). There is deliberately no "milestones crossed" count: measuring a crossing from
 * match rows would use the wrong baseline, and a rolling window would repeat one crossing on every nightly run.
 */
export type RunFacts = {
  status: 'ok' | 'running' | 'error' | string | null
  startedAt: string | null
  finishedAt: string | null
  matchesUpserted: number
  matchError: number
  matchMismatches: number
  error: string | null
}
export type NotificationInput = {
  latestRun: RunFacts | null
  pending: { stories: number; photos: number }
  /** Admin only; null when not loaded or unavailable. */
  duplicateCount: number | null
  imports: { count: number; latest: { at: string; seasons: number; matches: number } | null } | null
}
export type NotificationLine = { key: string; tone: 'warn' | 'info'; text: string; href?: string; linkText?: string }

/** A finished run counts as "last night" for a day and a half (the nightly sync, plus slack for a late run). */
export const LAST_NIGHT_MS = 36 * 3_600_000

export function notificationLines(
  input: NotificationInput,
  o: { isAdmin: boolean; adminRoute: string; now: Date; formatDate: (d: Date) => string },
): NotificationLine[] {
  const lines: NotificationLine[] = []
  const { adminRoute: r } = o
  const run = input.latestRun
  if (run) {
    if (run.status === 'error') {
      lines.push({ key: 'sync-failed', tone: 'warn', text: copy.committee.syncFailed })
      if (o.isAdmin && run.error) lines.push({ key: 'sync-error', tone: 'warn', text: copy.admin.syncError(run.error.slice(0, 300)), href: `${r}/collections/player-sync-runs`, linkText: copy.admin.syncRuns })
    } else if (run.status === 'running') {
      lines.push({ key: 'sync-running', tone: 'info', text: copy.committee.syncRunning })
    } else if (run.status === 'ok') {
      const done = run.finishedAt ? new Date(run.finishedAt) : null
      const recent = !!done && o.now.getTime() - done.getTime() <= LAST_NIGHT_MS
      lines.push({ key: 'sync-ok', tone: 'info', text: recent || !done ? copy.committee.syncOk : copy.committee.syncOkOlder(o.formatDate(done)) })
    }
    if (o.isAdmin && (run.status === 'ok' || run.status === 'error')) {
      const bad = run.matchError > 0 || run.matchMismatches > 0
      lines.push({
        key: 'sync-counts', tone: bad ? 'warn' : 'info',
        text: copy.admin.syncCounts({ matchesUpserted: run.matchesUpserted, matchError: run.matchError, matchMismatches: run.matchMismatches }),
        href: `${r}/collections/player-sync-runs`, linkText: copy.admin.syncRuns,
      })
    }
  }
  if (input.pending.stories > 0) lines.push({ key: 'stories', tone: 'warn', text: copy.committee.stories(input.pending.stories), href: `${r}/collections/stories?where[status][equals]=pending` })
  if (input.pending.photos > 0) lines.push({ key: 'photos', tone: 'warn', text: copy.committee.photos(input.pending.photos), href: `${r}/approvals` })
  if (o.isAdmin) {
    if (input.duplicateCount && input.duplicateCount > 0) lines.push({ key: 'duplicates', tone: 'warn', text: copy.admin.duplicates(input.duplicateCount), href: `${r}/player-data-tools#duplicates`, linkText: copy.admin.importsOpen })
    if (input.imports && input.imports.count > 0 && input.imports.latest) {
      const l = input.imports.latest
      lines.push({ key: 'imports', tone: 'info', text: copy.admin.imports(input.imports.count, o.formatDate(new Date(l.at)), l.seasons, l.matches), href: `${r}/player-data-tools#import`, linkText: copy.admin.importsOpen })
    }
  }
  // Problems first, then information; stable within each group.
  return [...lines.filter((l) => l.tone === 'warn'), ...lines.filter((l) => l.tone === 'info')]
}

/** "Nothing is waiting" is true only when no line asks for attention (information lines do not). */
export const allCaughtUp = (lines: readonly NotificationLine[]): boolean => !lines.some((l) => l.tone === 'warn')
