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
