/**
 * Grouping games into weekends (announce-teams spec 5.3). A "weekend" is the Monday-to-Sunday week a game falls in; it is keyed
 * by that week's Saturday. Games carry a club-local `localDate`; for a UTC instant, `localDateOf` finds the club-local date first
 * (so a 1 am game that is 2 pm the day before in UTC lands on the right day).
 */
const MS_DAY = 86_400_000

/** The club-local `YYYY-MM-DD` of an instant. */
export function localDateOf(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(instant))
}

/** The Saturday of the Monday-to-Sunday week that contains `localDate`. */
export function weekendKey(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return localDate
  const dow = d.getUTCDay() // 0 = Sunday
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return new Date(d.getTime() + (mondayOffset + 5) * MS_DAY).toISOString().slice(0, 10)
}

/** Groups by weekend, earliest weekend first; each group keeps the input order. */
export function groupByWeekend<T extends { localDate: string }>(rows: readonly T[]): { key: string; rows: T[] }[] {
  const map = new Map<string, T[]>()
  for (const r of rows) {
    const k = weekendKey(r.localDate)
    map.set(k, [...(map.get(k) ?? []), r])
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, list]) => ({ key, rows: list }))
}
