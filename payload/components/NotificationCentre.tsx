import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
import { allCaughtUp, notificationLines, type NotificationInput, type RunFacts } from '@/lib/admin/notifications'
import { listImportBatches } from '@/lib/history-import/server'
import { getDuplicateSuggestions } from '@/lib/players/duplicate-queries'
import type { Payload } from 'payload'
import { getPendingCounts } from '../admin/approvals'
import { notificationCopy } from '../admin/copy'

const dateFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' })

async function latestRun(payload: Payload): Promise<RunFacts | null> {
  try {
    const { docs } = await payload.find({ collection: 'player-sync-runs', sort: '-startedAt', limit: 1, depth: 0, overrideAccess: true })
    const d = docs[0]
    if (!d) return null
    return {
      status: d.status ?? null, startedAt: d.startedAt ?? null, finishedAt: d.finishedAt ?? null, matchesUpserted: d.matchesUpserted ?? 0,
      matchError: d.matchError ?? 0, matchMismatches: d.matchMismatches ?? 0, error: d.error ?? null,
    }
  } catch {
    return null
  }
}

/**
 * The Home page's "Needs your attention" list (W2 spec 6.4): the latest PlayHQ update, what is waiting for approval, and, for
 * admins, the duplicate-player count and the import log. Server component; every source is existing data and a failure in one
 * only drops its line.
 */
export async function NotificationCentre({ payload, isAdmin }: { payload: Payload; isAdmin: boolean }) {
  const [pending, run, duplicateCount, imports] = await Promise.all([
    getPendingCounts(payload),
    latestRun(payload),
    isAdmin ? getDuplicateSuggestions().then((s) => s.length).catch(() => null) : Promise.resolve(null),
    isAdmin
      ? listImportBatches(payload).then((b) => (b.length ? { count: b.length, latest: { at: b[0].at, seasons: b[0].seasons, matches: b[0].matches } } : { count: 0, latest: null })).catch(() => null)
      : Promise.resolve(null),
  ])
  const input: NotificationInput = { latestRun: run, pending, duplicateCount, imports }
  const lines = notificationLines(input, { isAdmin, adminRoute: payload.config.routes.admin, now: new Date(), formatDate: (d) => dateFormat.format(d) })
  return (
    <div className="club-attention" aria-label="Needs your attention">
      <h2 className="club-attention__title">Needs your attention</h2>
      {allCaughtUp(lines) && <p className="club-attention__none">{notificationCopy.committee.caughtUp}</p>}
      {lines.length > 0 && (
        <ul className="club-attention__list">
          {lines.map((l) => (
            <li key={l.key} data-tone={l.tone}>
              {l.href && !l.linkText ? <a href={l.href}>{l.text}</a> : l.text}
              {l.href && l.linkText ? <> <a href={l.href}>{l.linkText}</a></> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
