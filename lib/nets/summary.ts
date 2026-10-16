import { NETS } from './constants'

/**
 * What the player card says about net attendance (wave B spec 4.5). "Turned up" is the whole claim: never a percentage without the
 * window it covers, never a score or a form number.
 */
export type NetSessionLite = { id: number; localDate: string; held: boolean }
export type NetCardSummary = {
  weeks: number
  held: number
  attended: number
  lastDate: string | null
  /** Newest first. */
  dots: { id: number; localDate: string; present: boolean }[]
}

const addDays = (date: string, days: number): string => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * `sessions` are the club's sessions (any state); only sessions that were actually held, dated within the window and not in the
 * future count. `attendedIds` are the sessions this player was checked in to.
 */
export function netAttendanceSummary(input: { sessions: readonly NetSessionLite[]; attendedIds: ReadonlySet<number>; today: string; weeks?: number }): NetCardSummary {
  const weeks = input.weeks ?? NETS.cardWindowWeeks
  const from = addDays(input.today, -weeks * 7)
  const inWindow = input.sessions.filter((s) => s.held && s.localDate >= from && s.localDate <= input.today).sort((a, b) => (a.localDate === b.localDate ? b.id - a.id : a.localDate < b.localDate ? 1 : -1))
  const attended = inWindow.filter((s) => input.attendedIds.has(s.id))
  return {
    weeks,
    held: inWindow.length,
    attended: attended.length,
    lastDate: attended[0]?.localDate ?? null,
    dots: inWindow.slice(0, NETS.cardDots).map((s) => ({ id: s.id, localDate: s.localDate, present: input.attendedIds.has(s.id) })),
  }
}

/** "Turned up at 5 of 8 net sessions in the last 8 weeks, last on 3 Oct". `formatDate` is the club-locale short date. */
export function netSummarySentence(s: NetCardSummary, formatDate: (localDate: string) => string): string {
  const window = `in the last ${s.weeks} weeks`
  if (s.held === 0) return `No net sessions ${window}.`
  const sessions = s.held === 1 ? 'net session' : 'net sessions'
  if (s.attended === 0) return `Has not turned up at any of the ${s.held} ${sessions} ${window}.`
  return `Turned up at ${s.attended} of ${s.held} ${sessions} ${window}, last on ${formatDate(s.lastDate!)}.`
}
