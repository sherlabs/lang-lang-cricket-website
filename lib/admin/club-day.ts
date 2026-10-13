/**
 * Dates for sentences on the admin Home page, always in the club's own timezone and locale (never the server's or the viewer's).
 * Pure. A date-only value ("2026-10-15") is a calendar day and is formatted as that day; an instant is converted to the club's day.
 */
export type ClubClock = { timeZone: string; locale: string }

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** "Thu 15 Oct". */
export function formatClubDay(value: string | Date, clock: ClubClock): string {
  const at = typeof value === 'string' && DAY_ONLY.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  if (Number.isNaN(at.getTime())) return ''
  // A date-only value is already a calendar day, so it is read in UTC; an instant is read in the club's zone.
  const timeZone = typeof value === 'string' && DAY_ONLY.test(value) ? 'UTC' : clock.timeZone
  // Some locales put a comma after the weekday ('Thu, 15 Oct'); the house style has none.
  return new Intl.DateTimeFormat(clock.locale, { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(at).replace(/^([^\s,]+),\s/, '$1 ')
}

/** "15 Oct 2026", for "as of" lines. */
export function formatClubDate(value: string | Date, clock: ClubClock): string {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return ''
  return new Intl.DateTimeFormat(clock.locale, { timeZone: clock.timeZone, day: 'numeric', month: 'short', year: 'numeric' }).format(at)
}

/** The club's calendar day (YYYY-MM-DD) for an instant. */
export function clubDayKey(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}
