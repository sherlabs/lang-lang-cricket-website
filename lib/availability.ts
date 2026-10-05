/**
 * Availability answers (announce-teams spec 4.6): per fixture, in / maybe / out, else "no reply". Kept as a pure function so
 * ranges ("away until March") can slot in later without touching the callers.
 */
export const AVAILABILITY_STATUSES = ['in', 'maybe', 'out'] as const
export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number]
export type Answer = AvailabilityStatus | 'none'

export const ANSWER_LABEL: Record<Answer, string> = { in: 'In', maybe: 'Maybe', out: 'Out', none: 'No reply' }
/** Text-first so colour is never the only signal; the classes are Tailwind brand tokens or neutral utilities only. */
export const ANSWER_DOT: Record<Answer, string> = { in: 'bg-emerald-600', maybe: 'bg-amber-500', out: 'bg-red-600', none: 'bg-brand-grey/40' }

export const isStatus = (v: unknown): v is AvailabilityStatus => typeof v === 'string' && (AVAILABILITY_STATUSES as readonly string[]).includes(v)

export type AvailabilityRow = { fixtureId: number | string; status: AvailabilityStatus }

/** The explicit answer for a fixture, else "none". */
export function effectiveAvailability(rows: readonly AvailabilityRow[], fixtureId: number | string): Answer {
  const row = rows.find((r) => String(r.fixtureId) === String(fixtureId))
  return row && isStatus(row.status) ? row.status : 'none'
}

export type Tally = Record<Answer, number>
export function tally(answers: readonly Answer[]): Tally {
  const out: Tally = { in: 0, maybe: 0, out: 0, none: 0 }
  for (const a of answers) out[a] += 1
  return out
}

/** Plain-text note: trimmed, control characters removed, capped. Rendering escapes it (React), so this is only hygiene. */
export function cleanNote(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Have changes closed for a fixture? `lockHours` 0 means never (always open); otherwise changes close that many hours before
 * the start. A fixture with no start time never closes.
 */
export function changesClosed(startsAt: string | Date | null | undefined, lockHours: number, now: Date = new Date()): boolean {
  if (!lockHours || lockHours <= 0 || !startsAt) return false
  const start = new Date(startsAt).getTime()
  return Number.isFinite(start) && now.getTime() >= start - lockHours * 3_600_000
}
