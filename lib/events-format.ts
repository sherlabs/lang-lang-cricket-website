import { CLUB_LOCALE } from '@/config/site'
// Event dates are UTC-midnight calendar dates with the local time-of-day merged in
// as UTC hours (see lib/event-occurrences.ts), so every formatter here must read
// them in UTC or a non-UTC server would shift the displayed day.
function parts(d: Date, opts: Intl.DateTimeFormatOptions) {
  const list = new Intl.DateTimeFormat(CLUB_LOCALE, { ...opts, timeZone: 'UTC' }).formatToParts(d)
  return (t: Intl.DateTimeFormatPartTypes) => list.find((p) => p.type === t)?.value ?? ''
}

/** `Saturday 25 October` — assembled from parts so ICU comma differences can't leak in. */
export function formatLongDate(d: Date, withYear = false): string {
  const get = parts(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const core = `${get('weekday')} ${get('day')} ${get('month')}`
  return withYear ? `${core} ${get('year')}` : core
}

/** `{ day: '25', month: 'Oct' }` for the calendar-leaf date tile. */
export function dateTileParts(d: Date): { day: string; month: string } {
  const get = parts(d, { day: 'numeric', month: 'short' })
  return { day: get('day'), month: get('month') }
}

/** Weekday names, indexed 0 (Sunday) - 6 (Saturday) to match `dayOfWeek`. */
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
