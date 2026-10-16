import { looksLikeCardNumber } from './card'
import { isIsoDate } from './fee-input'
import { seasonRange } from './season'
import type { ShiftType } from './settings-defaults'

/**
 * The volunteer roster and hours ledger, as pure functions (wave D spec section 5). Nothing here reads a database: the data layer
 * (`lib/volunteers-office-queries.ts`) loads rows, calls these, and writes what they return. Hours only; there are no pay rates.
 */
export const WEEK_STATUSES = ['draft', 'open', 'confirmed'] as const
export type WeekStatus = (typeof WEEK_STATUSES)[number]
export const ASSIGNMENT_STATES = ['rostered', 'confirmed', 'no-show', 'cancelled'] as const
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number]
export const AVAILABILITY_STATES = ['yes', 'no', 'maybe'] as const
export type AvailabilityState = (typeof AVAILABILITY_STATES)[number]
export const HOURS_KINDS = ['volunteer', 'paid'] as const
export type HoursKind = (typeof HOURS_KINDS)[number]

export const isAvailabilityState = (v: unknown): v is AvailabilityState => typeof v === 'string' && (AVAILABILITY_STATES as readonly string[]).includes(v)
export const isHoursKind = (v: unknown): v is HoursKind => typeof v === 'string' && (HOURS_KINDS as readonly string[]).includes(v)
export const STATE_LABEL: Record<AssignmentState, string> = { rostered: 'Rostered', confirmed: 'Confirmed', 'no-show': 'Did not turn up', cancelled: 'Cancelled' }
export const AVAILABILITY_LABEL: Record<AvailabilityState, string> = { yes: 'Yes', maybe: 'Maybe', no: 'No' }

/** An assignment that takes up a slot and earns hours when the week is confirmed. */
export const isActiveState = (s: AssignmentState): boolean => s === 'rostered' || s === 'confirmed'

// ---- shift types ------------------------------------------------------------------------------------------------------------

export const isShiftKey = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(v)

/**
 * Checks the shift types a club typed in settings. A key must be a short slug and unique; hours and slots must be sensible; a key that
 * is already in use (`usedKeys`) can never be removed, because shifts and hours point at it. Returns a plain sentence, or null.
 */
export function validateShiftTypes(next: readonly Partial<ShiftType>[], usedKeys: readonly string[] = []): string | null {
  const seen = new Set<string>()
  for (const t of next) {
    if (!isShiftKey(t.key)) return 'Each shift type needs a short code of lower case letters, numbers and dashes (for example "canteen").'
    if (seen.has(t.key)) return `The code "${t.key}" is used twice. Each shift type needs its own code.`
    seen.add(t.key)
    if (typeof t.label !== 'string' || !t.label.trim()) return `Give the "${t.key}" shift type a name.`
    const h = Number(t.defaultHours)
    if (!Number.isFinite(h) || h <= 0 || h > 24) return `The hours for "${t.label}" must be more than 0 and no more than 24.`
    const s = Number(t.defaultSlots)
    if (!Number.isInteger(s) || s < 1 || s > 50) return `The number of people for "${t.label}" must be a whole number from 1 to 50.`
    if (t.kind !== undefined && t.kind !== null && !isHoursKind(t.kind)) return `The kind for "${t.label}" must be volunteer or paid.`
  }
  for (const k of usedKeys) if (!seen.has(k)) return `The shift type with code "${k}" is already used by shifts or hours, so it cannot be removed. Rename it instead.`
  return null
}

// ---- weeks ------------------------------------------------------------------------------------------------------------------

export type FixtureDay = { localDate: string; isHome: boolean; status: string }

/**
 * The game days to create weeks for: dates of home games in the season that are not removed, once each, minus dates that already
 * have a week. Sorted. A date PlayHQ moved shows up as a new date; the old week stays (it can be deleted while it is empty).
 */
export function weekDatesFromFixtures(fixtures: readonly FixtureDay[], season: string, existingDates: readonly string[]): string[] {
  const range = seasonRange(season)
  if (!range) return []
  const have = new Set(existingDates)
  const out = new Set<string>()
  for (const f of fixtures) {
    if (!f.isHome || f.status === 'removed' || !isIsoDate(f.localDate)) continue
    if (f.localDate < range.from || f.localDate > range.to || have.has(f.localDate)) continue
    out.add(f.localDate)
  }
  return [...out].sort()
}

export type WeekInputError = 'date' | 'label' | 'duplicate'
export function validateWeekInput(raw: { date: unknown; label: unknown }, existingDates: readonly string[]): { ok: true; date: string; label: string | null } | { ok: false; error: WeekInputError } {
  if (!isIsoDate(raw.date)) return { ok: false, error: 'date' }
  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null
  if (label && (label.length > 80 || looksLikeCardNumber(label))) return { ok: false, error: 'label' }
  if (existingDates.includes(raw.date)) return { ok: false, error: 'duplicate' }
  return { ok: true, date: raw.date, label }
}

// ---- availability -----------------------------------------------------------------------------------------------------------

export const AVAILABILITY_NOTE_MAX = 200

export type AvailabilityError = 'state' | 'note' | 'shifts'
/** What a volunteer may post about one week. Only the three answers, a short note without card-like numbers, and known shift codes. */
export function parseAvailability(raw: { state: unknown; note: unknown; preferred?: unknown }, knownShiftKeys: readonly string[]): { ok: true; state: AvailabilityState; note: string | null; preferred: string[] } | { ok: false; error: AvailabilityError } {
  if (!isAvailabilityState(raw.state)) return { ok: false, error: 'state' }
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null
  if (note && (note.length > AVAILABILITY_NOTE_MAX || looksLikeCardNumber(note))) return { ok: false, error: 'note' }
  const list = Array.isArray(raw.preferred) ? raw.preferred : raw.preferred === undefined || raw.preferred === '' ? [] : [raw.preferred]
  const preferred: string[] = []
  for (const k of list) {
    if (typeof k !== 'string' || !knownShiftKeys.includes(k)) return { ok: false, error: 'shifts' }
    if (!preferred.includes(k)) preferred.push(k)
  }
  return { ok: true, state: raw.state, note, preferred }
}

// ---- the roster -------------------------------------------------------------------------------------------------------------

export type ShiftRow = { id: number; weekId: number; shiftTypeKey: string; labelSnapshot: string; hours: number; slots: number }
export type AssignmentRow = { id: number; shiftId: number; memberId: number; kind: HoursKind; hours: number; state: AssignmentState }

/** How full a set of shifts is. A shift over its capacity does not make up for an empty one elsewhere. */
export function fillStatus(shifts: readonly Pick<ShiftRow, 'id' | 'slots'>[], assignments: readonly Pick<AssignmentRow, 'shiftId' | 'state'>[]): { slots: number; filled: number; empty: number } {
  const active = new Map<number, number>()
  for (const a of assignments) if (isActiveState(a.state)) active.set(a.shiftId, (active.get(a.shiftId) ?? 0) + 1)
  let slots = 0
  let filled = 0
  for (const s of shifts) {
    slots += s.slots
    filled += Math.min(active.get(s.id) ?? 0, s.slots)
  }
  return { slots, filled, empty: slots - filled }
}

export type RosterWarning = { kind: 'double-booked' | 'over-capacity' | 'said-no'; shiftId: number | null; memberId: number | null }

/** Warnings, never blocks (spec 5.4): someone in two shifts the same day, a shift with too many people, someone who said No. */
export function rosterWarnings(shifts: readonly Pick<ShiftRow, 'id' | 'slots'>[], assignments: readonly AssignmentRow[], answers: ReadonlyMap<number, AvailabilityState>): RosterWarning[] {
  const out: RosterWarning[] = []
  const active = assignments.filter((a) => isActiveState(a.state))
  const perShift = new Map<number, number>()
  const perMember = new Map<number, number>()
  for (const a of active) {
    perShift.set(a.shiftId, (perShift.get(a.shiftId) ?? 0) + 1)
    perMember.set(a.memberId, (perMember.get(a.memberId) ?? 0) + 1)
  }
  for (const s of shifts) if ((perShift.get(s.id) ?? 0) > s.slots) out.push({ kind: 'over-capacity', shiftId: s.id, memberId: null })
  for (const [memberId, n] of perMember) if (n > 1) out.push({ kind: 'double-booked', shiftId: null, memberId })
  for (const a of active) if (answers.get(a.memberId) === 'no') out.push({ kind: 'said-no', shiftId: a.shiftId, memberId: a.memberId })
  return out
}

export type Candidate = { id: number; name: string; answer: AvailabilityState | null; /** Combined shifts this season, paid and volunteer not told apart. */ load: number; preferred: boolean }

/** People who said Yes first, then Maybe, then no answer, then No; within a group the lightest load first, then by name. */
export function rankCandidates(people: readonly { id: number; name: string }[], answers: ReadonlyMap<number, { state: AvailabilityState; preferred: readonly string[] }>, load: ReadonlyMap<number, number>, shiftTypeKey: string): Candidate[] {
  const rank = (a: AvailabilityState | null): number => (a === 'yes' ? 0 : a === 'maybe' ? 1 : a === null ? 2 : 3)
  return people
    .map((p) => {
      const a = answers.get(p.id)
      return { id: p.id, name: p.name, answer: a?.state ?? null, load: load.get(p.id) ?? 0, preferred: Boolean(a?.preferred.includes(shiftTypeKey)) }
    })
    .sort((x, y) => rank(x.answer) - rank(y.answer) || Number(y.preferred) - Number(x.preferred) || x.load - y.load || x.name.localeCompare(y.name))
}

// ---- confirming a week into the ledger --------------------------------------------------------------------------------------

export type HourPost = { assignmentId: number; memberId: number; hours: number; kind: HoursKind; shiftTypeKey: string; date: string }

/**
 * The ledger rows a confirmation must add: one per rostered or confirmed assignment that has no live row yet. Running it twice
 * adds nothing the second time (the database also refuses a second live row for one assignment). No-shows and cancellations earn
 * nothing.
 */
export function planConfirm(date: string, shifts: readonly ShiftRow[], assignments: readonly AssignmentRow[], liveAssignmentIds: ReadonlySet<number>): { post: HourPost[]; becomeConfirmed: number[] } {
  const shiftKey = new Map(shifts.map((s) => [s.id, s.shiftTypeKey]))
  const post: HourPost[] = []
  const becomeConfirmed: number[] = []
  for (const a of assignments) {
    if (!isActiveState(a.state)) continue
    if (a.state === 'rostered') becomeConfirmed.push(a.id)
    if (liveAssignmentIds.has(a.id)) continue
    const key = shiftKey.get(a.shiftId)
    if (!key) continue
    post.push({ assignmentId: a.id, memberId: a.memberId, hours: a.hours, kind: a.kind, shiftTypeKey: key, date })
  }
  return { post, becomeConfirmed }
}

/** Reopening voids the week's live roster rows and puts confirmed assignments back to rostered (no-shows stay no-shows). */
export function planReopen(assignments: readonly AssignmentRow[]): { backToRostered: number[] } {
  return { backToRostered: assignments.filter((a) => a.state === 'confirmed').map((a) => a.id) }
}

// ---- hours reports and the small-count rule ----------------------------------------------------------------------------------

export type HoursRow = { memberId: number; date: string; hours: number; kind: HoursKind; shiftTypeKey: string }

/** A cell covering fewer people than this is never shown as a number (spec 5.4). */
export const SMALL_COUNT = 3

const round = (n: number): number => Math.round(n * 100) / 100

export type TableCell = { key: string; hours: number; people: number }
export type SmallCountTable = {
  /** Cells with at least `SMALL_COUNT` distinct people. */
  cells: TableCell[]
  /** The cells that were too small, merged. `hours` is null when even the merged row covers fewer than 3 people. */
  other: { hours: number | null; people: number | null } | null
  /** The table's total, or null when it could be worked out from the rest by subtraction. */
  totalHours: number | null
}

/** Groups rows by `keyOf`, hides small cells in "other", and hides the total whenever "other" still identifies a person. */
export function smallCountTable(rows: readonly HoursRow[], keyOf: (r: HoursRow) => string): SmallCountTable {
  const groups = new Map<string, { hours: number; people: Set<number> }>()
  for (const r of rows) {
    const g = groups.get(keyOf(r)) ?? { hours: 0, people: new Set<number>() }
    g.hours += r.hours
    g.people.add(r.memberId)
    groups.set(keyOf(r), g)
  }
  const cells: TableCell[] = []
  const smallHours: number[] = []
  const smallPeople = new Set<number>()
  for (const [key, g] of [...groups].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (g.people.size >= SMALL_COUNT) cells.push({ key, hours: round(g.hours), people: g.people.size })
    else {
      smallHours.push(g.hours)
      for (const p of g.people) smallPeople.add(p)
    }
  }
  const total = round(rows.reduce((s, r) => s + r.hours, 0))
  if (smallHours.length === 0) return { cells, other: null, totalHours: total }
  if (smallPeople.size >= SMALL_COUNT) return { cells, other: { hours: round(smallHours.reduce((a, b) => a + b, 0)), people: smallPeople.size }, totalHours: total }
  return { cells, other: { hours: null, people: null }, totalHours: null }
}

export type KindSummary =
  | { kind: HoursKind; state: 'none' }
  | { kind: HoursKind; state: 'hidden' }
  | {
      kind: HoursKind
      state: 'shown'
      people: number
      hours: number | null
      /** Either breakdown is null when it was withheld so the other cannot be subtracted from it (see `aggregateHours`). */
      byType: SmallCountTable | null
      byMonth: SmallCountTable | null
    }

/**
 * The name-free aggregate (grant reports, and the only hours view an editor gets). Paid and volunteer hours are separate datasets:
 * a kind with fewer than 3 distinct people is not reported at all, so nothing shown includes it and it cannot be recovered by
 * subtraction. Within a kind the two breakdowns (by job, by month) both add up to the same true total, so when one of them has a
 * hidden "other" the other must not be shown at all: its cells would add up to the true total and the hidden group would be the
 * difference. Only the breakdown that still has its hidden group is shown, without a total; the headline total is withheld too.
 */
export function aggregateHours(rows: readonly HoursRow[]): KindSummary[] {
  return HOURS_KINDS.map((kind): KindSummary => {
    const mine = rows.filter((r) => r.kind === kind)
    if (mine.length === 0) return { kind, state: 'none' }
    const people = new Set(mine.map((r) => r.memberId)).size
    if (people < SMALL_COUNT) return { kind, state: 'hidden' }
    const byType = smallCountTable(mine, (r) => r.shiftTypeKey)
    const byMonth = smallCountTable(mine, (r) => r.date.slice(0, 7))
    const typeHidden = byType.totalHours === null
    const monthHidden = byMonth.totalHours === null
    if (!typeHidden && !monthHidden) return { kind, state: 'shown', people, hours: round(mine.reduce((s, r) => s + r.hours, 0)), byType, byMonth }
    // The breakdown that keeps a hidden group is safe on its own (no total to subtract from); the complete one is withheld.
    return { kind, state: 'shown', people, hours: null, byType: typeHidden ? byType : null, byMonth: typeHidden ? null : byMonth }
  })
}

/** Per-person totals for admins. */
export function hoursByPerson(rows: readonly HoursRow[]): { memberId: number; volunteer: number; paid: number }[] {
  const m = new Map<number, { memberId: number; volunteer: number; paid: number }>()
  for (const r of rows) {
    const e = m.get(r.memberId) ?? { memberId: r.memberId, volunteer: 0, paid: 0 }
    e[r.kind] = round(e[r.kind] + r.hours)
    m.set(r.memberId, e)
  }
  return [...m.values()]
}

// ---- manual hours -----------------------------------------------------------------------------------------------------------

export type ManualHoursError = 'member' | 'date' | 'hours' | 'kind' | 'shift' | 'note'
export function validateManualHours(raw: { memberId: unknown; date: unknown; hours: unknown; kind: unknown; shiftTypeKey: unknown; note: unknown }, knownKeys: readonly string[], today: string): { ok: true; memberId: number; date: string; hours: number; kind: HoursKind; shiftTypeKey: string | null; note: string | null } | { ok: false; error: ManualHoursError } {
  const memberId = Number(raw.memberId)
  if (!Number.isInteger(memberId) || memberId < 1) return { ok: false, error: 'member' }
  if (!isIsoDate(raw.date) || raw.date > today) return { ok: false, error: 'date' }
  const hours = typeof raw.hours === 'string' ? Number(raw.hours.replace(',', '.').trim()) : Number(raw.hours)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return { ok: false, error: 'hours' }
  if (!isHoursKind(raw.kind)) return { ok: false, error: 'kind' }
  const key = typeof raw.shiftTypeKey === 'string' && raw.shiftTypeKey ? raw.shiftTypeKey : null
  if (key && !knownKeys.includes(key)) return { ok: false, error: 'shift' }
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null
  if (note && (note.length > 300 || looksLikeCardNumber(note))) return { ok: false, error: 'note' }
  return { ok: true, memberId, date: raw.date, hours: round(hours), kind: raw.kind, shiftTypeKey: key, note }
}
