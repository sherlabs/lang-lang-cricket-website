import { formatClubDay, type ClubClock } from './club-day'
import { notificationLines, type NotificationInput } from './notifications'

/**
 * "Needs your attention" on the admin Home page (wave G WP-3). Pure: it reads the same facts the notification centre loads and
 * says each one as a task in plain English with one button. Information (a good sync, an import log, posts due today) is not a task
 * and never appears; sync internals live under Advanced > System health for administrators.
 *
 * Definitions of the numbers (fixed, tested):
 * - "volunteer spots still empty" is `required minus signed up`, floored at zero per job, summed over the NEXT game day only; the
 *   caller passes `fillStatus`'s result for it, this layer never recounts.
 * - Dates are the club's own day, formatted with the club timezone and locale.
 */
export type AttentionItem = {
  key: string
  text: string
  /** The number the sentence is about; shown as a badge. */
  count: number
  /** Button label. Null when the person cannot act themselves. */
  action: string | null
  href: string | null
  /** An honest qualifier shown as the button's tooltip ("cancelled and no-show people are not counted"). */
  note?: string
}

/** The next volunteer game day as the roster counts it. `date` is a YYYY-MM-DD calendar day. */
export type VolunteerFacts = { empty: number; date: string; daysAway: number }

/** A volunteer gap is news when the game day is this close (days). */
export const VOLUNTEER_LOOKAHEAD_DAYS = 7

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
/** "Two things are waiting for you." or "You're all caught up." */
export function greetingLine(count: number): string {
  if (count <= 0) return "You're all caught up."
  if (count === 1) return 'One thing is waiting for you.'
  return `${count < WORDS.length ? WORDS[count] : String(count)} things are waiting for you.`
}

export type AttentionOptions = { isAdmin: boolean; adminRoute: string; clock: ClubClock; now: Date; volunteers?: VolunteerFacts | null }

export const SYSTEM_HEALTH_ANCHOR = '#system-health'

/** The rows for the Home page, most urgent first. Empty means the section is not drawn at all. */
export function attentionItems(input: NotificationInput, o: AttentionOptions): AttentionItem[] {
  const r = o.adminRoute
  const problems: AttentionItem[] = []
  const todo: AttentionItem[] = []
  const add = (list: AttentionItem[], key: string, n: number | null | undefined, say: (n: number) => string, action: string, href: string, note?: string) => {
    if (n && n > 0) list.push({ key, text: say(n), count: n, action, href, note })
  }

  // The failed-update row reuses the notification rules (a run stuck "running" counts as failed). Only an administrator can open it.
  if (notificationLines(input, { isAdmin: o.isAdmin, adminRoute: r, now: o.now, formatDate: () => '' }).some((l) => l.key === 'sync-failed')) {
    problems.push({
      key: 'sync-failed', count: 1, note: 'Ask the site administrator to look.',
      text: "Last night's stats update did not finish. The site is still showing the previous numbers",
      action: o.isAdmin ? 'Open System health' : null, href: o.isAdmin ? `${r}${SYSTEM_HEALTH_ANCHOR}` : null,
    })
  }
  add(problems, 'stories', input.pending.stories, (n) => `${n} ${plural(n, 'story is', 'stories are')} waiting for approval`, 'Review stories', `${r}/collections/stories?where[status][equals]=pending`)
  add(problems, 'photos', input.pending.photos, (n) => `${n} ${plural(n, 'photo is', 'photos are')} waiting for approval`, 'Review photos', `${r}/approvals`)
  add(problems, 'social-failed', input.social?.failed, (n) => `${n} ${plural(n, 'post needs', 'posts need')} a look`, 'Open posts', `${r}/social?tab=attention`)
  add(problems, 'social-overdue', input.social?.overdue, (n) => `${n} scheduled ${plural(n, 'post is', 'posts are')} late. Please check the scheduler`, 'Open posts', `${r}/social?tab=scheduled`)

  const v = o.volunteers
  if (v && v.empty > 0 && v.daysAway <= VOLUNTEER_LOOKAHEAD_DAYS) {
    problems.push({
      key: 'volunteers-empty', count: v.empty, action: 'Open volunteers', href: `${r}/office/volunteers`,
      text: `${v.empty} volunteer ${plural(v.empty, 'spot is', 'spots are')} still empty for ${formatClubDay(v.date, o.clock)}`,
      note: 'Cancelled and no-show people are not counted.',
    })
  }
  add(problems, 'jobs-overdue', input.diary?.overdue, (n) => `${n} club ${plural(n, 'job is', 'jobs are')} overdue`, 'Open the season diary', `${r}/office/diary?filter=overdue`, 'Done jobs are not counted.')
  add(problems, 'jobs-blocked', input.diary?.blocked, (n) => `${n} club ${plural(n, 'job is', 'jobs are')} blocked`, 'Open the season diary', `${r}/office/diary?filter=blocked`, 'Done jobs are not counted.')
  add(problems, 'stock-low', input.stock?.low, (n) => `${n} ${plural(n, 'item is', 'items are')} running low`, 'Open Stock', `${r}/office/stock?show=low`, 'Switched-off items are not counted.')
  add(problems, 'stock-overdue', input.stock?.overdue, (n) => `${n} issued ${plural(n, 'item is', 'items are')} overdue back`, 'See what is owed back', `${r}/office/stock?tab=owed`)
  add(problems, 'actions-overdue', input.meetings?.overdue, (n) => `${n} committee ${plural(n, 'action is', 'actions are')} overdue`, 'Open committee actions', `${r}/office/meetings/actions`, 'Done and dropped actions are not counted.')
  add(problems, 'actions-blocked', input.meetings?.blocked, (n) => `${n} committee ${plural(n, 'action is', 'actions are')} blocked`, 'Open committee actions', `${r}/office/meetings/actions`, 'Done and dropped actions are not counted.')

  add(todo, 'jobs-unowned', input.diary?.unowned, (n) => `${n} club ${plural(n, 'job has', 'jobs have')} nobody looking after ${plural(n, 'it', 'them')}`, 'Open the season diary', `${r}/office/diary?filter=unowned`)
  if (o.isAdmin) {
    add(problems, 'duplicates', input.duplicateCount, (n) => `${n} possible duplicate ${plural(n, 'player', 'players')} to look at`, 'Review players', `${r}/player-data-tools#duplicates`)
    if (input.signIn?.testFailedAt) problems.push({ key: 'signin-unreachable', count: 1, text: 'Facebook sign-in could not be reached', action: 'Open sign-in settings', href: `${r}/globals/site-settings` })
    add(todo, 'fees-owing', input.fees?.members, (n) => `${n} ${plural(n, 'member owes', 'members owe')} match fees`, 'Open Fees', `${r}/office/fees`, 'Open season only; unmatched appearances are not counted.')
  }
  return [...problems, ...todo]
}
