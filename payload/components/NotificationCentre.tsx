import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
import { allCaughtUp, notificationLines, type NotificationInput, type RunFacts } from '@/lib/admin/notifications'
import { feeOwingSummary } from '@/lib/fees-office-queries'
import { gameDayLabel } from '@/lib/office/game-day'
import { nextGameDay } from '@/lib/volunteers-office-queries'
import { diaryFigures } from '@/lib/diary-office-queries'
import { stockFigures } from '@/lib/stock-office-queries'
import { meetingStats } from '@/lib/meetings-office-queries'
import { listImportBatches } from '@/lib/history-import/server'
import { getDuplicateSuggestions } from '@/lib/players/duplicate-queries'
import { readSignInState } from '@/lib/signin/state'
import { socialCounts } from '@/lib/social-queries'
import { readHeartbeat } from '@/lib/social/heartbeat'
import { overdueAfterMinutes } from '@/lib/social/heartbeat-math'
import { zonedToUtc } from '@/lib/social/schedule-time'
import { currentClubDate } from '@/lib/selection/club-date'
import type { Payload } from 'payload'
import { getPendingCounts } from '../admin/approvals'
import { notificationCopy, officeCopy } from '../admin/copy'

const dateFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' })

/** Posts that did not go out, posts due today and posts overdue, from the queue (counts only). A failure drops the lines, never the page. */
async function socialFacts(payload: Payload) {
  try {
    const today = currentClubDate()
    const next = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
    const dayEnd = zonedToUtc(next, '00:00', CLUB_TIMEZONE) ?? new Date(Date.now() + 86_400_000)
    const beat = await readHeartbeat(payload, overdueAfterMinutes)
    return await socialCounts(dayEnd, overdueAfterMinutes(beat.observedMinutes))
  } catch {
    return null
  }
}

/** Admin only: a failed broker check, and selectors Facebook unlinked in the last week. A read failure drops the lines, never the page. */
async function signInFacts(payload: Payload) {
  try {
    const s = await readSignInState(payload)
    const recent = s.lastEvent.at && Date.now() - new Date(s.lastEvent.at).getTime() < 7 * 86_400_000
    return { testFailedAt: s.lastTest.at && !s.lastTest.ok ? s.lastTest.at : null, unlinked: recent ? s.lastEvent.unlinked : 0 }
  } catch {
    return null
  }
}

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
export async function NotificationCentre({ payload, isAdmin, user }: { payload: Payload; isAdmin: boolean; user?: unknown }) {
  const [pending, run, duplicateCount, imports, social, fees, game, meetings, diary, stock, signIn] = await Promise.all([
    getPendingCounts(payload),
    latestRun(payload),
    isAdmin ? getDuplicateSuggestions().then((s) => s.length).catch(() => null) : Promise.resolve(null),
    isAdmin
      ? listImportBatches(payload).then((b) => (b.length ? { count: b.length, latest: { at: b[0].at, seasons: b[0].seasons, matches: b[0].matches } } : { count: 0, latest: null })).catch(() => null)
      : Promise.resolve(null),
    socialFacts(payload),
    isAdmin ? feeOwingSummary(user) : Promise.resolve(null),
    nextGameDay(user),
    meetingStats(user),
    diaryFigures(user),
    stockFigures(user),
    isAdmin ? signInFacts(payload) : Promise.resolve(null),
  ])
  const input: NotificationInput = { signIn, latestRun: run, pending, duplicateCount, imports, social, stock: stock && (stock.low > 0 || stock.overdue > 0) ? { low: stock.low, overdue: stock.overdue, lowText: officeCopy.stock.low(stock.low), overdueText: officeCopy.stock.overdue(stock.overdue) } : null, diary: diary && (diary.overdue > 0 || diary.blocked > 0 || diary.unowned > 0) ? { ...diary, overdueText: officeCopy.diary.overdue(diary.overdue), blockedText: officeCopy.diary.blocked(diary.blocked), unownedText: officeCopy.diary.unowned(diary.unowned) } : null, meetings: meetings && (meetings.overdue > 0 || meetings.blocked > 0) ? { overdue: meetings.overdue, blocked: meetings.blocked, overdueText: officeCopy.meetings.overdue(meetings.overdue), blockedText: officeCopy.meetings.blocked(meetings.blocked) } : null, volunteers: game && game.daysAway <= 3 && game.empty > 0 ? { empty: game.empty, text: officeCopy.volunteers.notification(game.empty, gameDayLabel(game.date)) } : null, fees: fees ? { members: fees.members, text: officeCopy.fees.notification(fees.members, fees.money) } : null }
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
