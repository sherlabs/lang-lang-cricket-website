/**
 * The "form read" (announce-teams spec 5.2), deliberately minimal: the raw last-five scores from stored games, newest first.
 * "No data" is never shown as zero. A prompt for the selector, not a verdict (hot/steady/cold scoring is deferred).
 */
export const FORM_WINDOW_DAYS = 400
export const FORM_COUNT = 5
export const NO_DATA = 'No data'

export type BatEntry = { date: string; runs: number; notOut: boolean }
export type BowlEntry = { date: string; wickets: number; runs: number }

/** Newest first, inside the window, at most `count`. `date` is a `YYYY-MM-DD` local date. */
export function recentEntries<T extends { date: string }>(rows: readonly T[], now: Date = new Date(), windowDays: number = FORM_WINDOW_DAYS, count: number = FORM_COUNT): T[] {
  const cutoff = new Date(now.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10)
  return rows.filter((r) => r.date >= cutoff).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, count)
}

export function formatBatting(rows: readonly BatEntry[]): string {
  return rows.length === 0 ? NO_DATA : rows.map((r) => `${r.runs}${r.notOut ? '*' : ''}`).join(', ')
}

export function formatBowling(rows: readonly BowlEntry[]): string {
  return rows.length === 0 ? NO_DATA : rows.map((r) => `${r.wickets}/${r.runs}`).join(', ')
}
