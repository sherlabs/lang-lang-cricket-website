import { CLUB_LOCALE, CLUB_TIMEZONE } from '@/config/site'
function parseHHmm(t: string): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number)
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 }
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

/**
 * Every date matching `dayOfWeek` between `startDate` and `endDate`
 * (inclusive), clipped to `range`, with `eventTime` merged into each
 * result. Walks day-by-day in UTC so a local-timezone shift can never
 * push a date across a day boundary.
 */
export function getOccurrences(
  event: { dayOfWeek: number; eventTime: string; startDate: Date; endDate: Date },
  range: { from: Date; to: Date }
): Date[] {
  const { h, m } = parseHHmm(event.eventTime)
  const rangeStart = utcMidnight(event.startDate > range.from ? event.startDate : range.from)
  const rangeEnd = utcMidnight(event.endDate < range.to ? event.endDate : range.to)
  if (rangeStart > rangeEnd) return []

  const occurrences: Date[] = []
  const cursor = new Date(rangeStart)
  while (cursor <= rangeEnd) {
    if (cursor.getUTCDay() === event.dayOfWeek) {
      occurrences.push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), h, m)))
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return occurrences
}

/** Combines a one-time event's date with its time-of-day, the same way getOccurrences does for recurring events. */
export function getOneTimeEventDateTime(event: { eventDate: Date; eventTime: string }): Date {
  const { h, m } = parseHHmm(event.eventTime)
  const d = event.eventDate
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m))
}

/**
 * "Now", encoded the same wall-clock-as-UTC way as every other date/time in
 * this feature: the current Melbourne local date/time, with those local
 * parts written directly into a UTC `Date` (not a real UTC instant). Use
 * this instead of `new Date()` for any comparison against event dates —
 * comparing a real UTC instant against a wall-clock-as-UTC value would be
 * off by Melbourne's UTC offset (10-11 hours depending on daylight saving).
 *
 * Takes the real "now" as an explicit, defaultable parameter (rather than
 * reading `Date.now()` internally) so it stays a pure function of its
 * input and is trivial to test with a fixed instant.
 */
export function nowAsEventClock(now: Date = new Date()): Date {
  // A fixed locale on purpose: these parts are parsed as numbers, not displayed.
  const parts = new Intl.DateTimeFormat(CLUB_LOCALE, {
    timeZone: CLUB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute')))
}
