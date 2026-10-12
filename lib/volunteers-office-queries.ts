import 'server-only'
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { currentClubDate } from '@/lib/selection/club-date'
import { isAdminUser, isStaffUser } from '@/payload/access'
import { listMemberNames } from './members-queries'
import { inTransaction, noon } from './office/fee-load'
import { displayNameFor, memberIsJunior, shortNameFor } from './office/members'
import { isSeasonName, seasonOfClubDate, seasonRange } from './office/season'
import { getOfficeSettings } from './office/settings-server'
import type { OfficeSettings } from './office/settings'
import { officeCopy } from '@/payload/admin/copy'
import { volunteerToken } from './volunteer-link'
import { volunteerPath } from '@/config/site'
import { isIsoDate } from './office/fee-input'
import type { VolunteerError, VolunteerNotice } from './office/volunteer-input'
import type { HourPost } from './office/volunteers'
import {
  aggregateHours,
  fillStatus,
  hoursByPerson,
  isActiveState,
  isHoursKind,
  planConfirm,
  planReopen,
  rankCandidates,
  rosterWarnings,
  validateManualHours,
  validateWeekInput,
  weekDatesFromFixtures,
  type AssignmentRow,
  type AssignmentState,
  type AvailabilityState,
  type Candidate,
  type HoursKind,
  type HoursRow,
  type KindSummary,
  type RosterWarning,
  type ShiftRow,
  type WeekStatus,
} from './office/volunteers'

/**
 * The data layer for the volunteer roster (wave D spec section 5). Every function checks its caller itself: the committee (admin and
 * editor) may run the roster, only admins see per-person hours or paid status. The roster collections allow nobody to write over
 * REST, so these writes (made with the access override after the check) are the only door, and they keep the invariants: a confirmed
 * week is frozen, one live hours row per assignment, paid status derived from the shift type and never posted by a form.
 */
const staffOnly = (user: unknown): user is TypedUser => isStaffUser(user as never)
const adminOnly = (user: unknown): user is TypedUser => isAdminUser(user as never)
type Doc = Record<string, unknown>
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const posInt = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 && n < 2_000_000_000 ? n : null
}
export type ActionResult = { ok: true; notice: VolunteerNotice; n?: number } | { ok: false; code: VolunteerError }
const fail = (code: VolunteerError): ActionResult => ({ ok: false, code })
const done = (notice: VolunteerNotice, n?: number): ActionResult => ({ ok: true, notice, ...(n !== undefined ? { n } : {}) })

// ---- names ------------------------------------------------------------------------------------------------------------------

/**
 * Names for people already on the roster (by id), for the committee. A junior is first name and last initial. This is a lookup of
 * ids the caller already holds, not a list of members, so it opens nothing the roster projection did not.
 */
async function namesFor(payload: Payload, ids: readonly number[], today: string): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (!ids.length) return out
  const res = await payload.find({
    collection: 'members',
    where: { id: { in: [...new Set(ids)] } },
    pagination: false,
    depth: 1,
    overrideAccess: true,
    select: { firstName: true, lastName: true, preferredName: true, dateOfBirth: true, erasedAt: true, player: true, person: true },
  })
  for (const m of res.docs as unknown as (Doc & { id: number })[]) {
    const player = m.player && typeof m.player === 'object' ? (m.player as never) : null
    const person = m.person && typeof m.person === 'object' ? (m.person as never) : null
    const src = { ...(m as object), player, person } as never
    out.set(m.id, memberIsJunior({ dateOfBirth: m.dateOfBirth as string | null, player }, today) ? shortNameFor(src) : displayNameFor(src))
  }
  return out
}

/** Full names for the admin-only hours report (no junior shortening: admins see members anyway). */
async function fullNamesFor(payload: Payload, ids: readonly number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (!ids.length) return out
  const res = await payload.find({ collection: 'members', where: { id: { in: [...new Set(ids)] } }, pagination: false, depth: 1, overrideAccess: true, select: { firstName: true, lastName: true, preferredName: true, erasedAt: true, player: true, person: true } })
  for (const m of res.docs as unknown as (Doc & { id: number })[]) {
    out.set(m.id, displayNameFor({ ...(m as object), player: m.player && typeof m.player === 'object' ? (m.player as never) : null, person: m.person && typeof m.person === 'object' ? (m.person as never) : null } as never))
  }
  return out
}

// ---- loading ----------------------------------------------------------------------------------------------------------------

type WeekRow = { id: number; season: string; date: string; label: string | null; status: WeekStatus }
const toWeek = (d: Doc): WeekRow => ({ id: d.id as number, season: String(d.season ?? ''), date: day(d.date), label: typeof d.label === 'string' ? d.label : null, status: (d.status as WeekStatus) ?? 'draft' })
const toShift = (d: Doc): ShiftRow => ({ id: d.id as number, weekId: idOf(d.week) ?? 0, shiftTypeKey: String(d.shiftTypeKey ?? ''), labelSnapshot: String(d.labelSnapshot ?? ''), hours: num(d.hours), slots: num(d.slots) })
const toAssignment = (d: Doc): AssignmentRow => ({ id: d.id as number, shiftId: idOf(d.shift) ?? 0, memberId: idOf(d.member) ?? 0, kind: isHoursKind(d.kind) ? d.kind : 'volunteer', hours: num(d.hours), state: (d.state as AssignmentState) ?? 'rostered' })

async function loadWeek(payload: Payload, weekId: number): Promise<{ week: WeekRow; shifts: ShiftRow[]; assignments: AssignmentRow[] } | null> {
  const doc = await payload.findByID({ collection: 'volunteer-weeks', id: weekId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!doc) return null
  const shifts = ((await payload.find({ collection: 'volunteer-shifts', where: { week: { equals: weekId } }, pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs as unknown as Doc[]).map(toShift)
  const assignments = shifts.length
    ? ((await payload.find({ collection: 'volunteer-assignments', where: { shift: { in: shifts.map((s) => s.id) } }, pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs as unknown as Doc[]).map(toAssignment)
    : []
  return { week: toWeek(doc as unknown as Doc), shifts, assignments }
}

async function liveAssignmentIds(payload: Payload, assignmentIds: readonly number[], req?: Partial<PayloadRequest>): Promise<Set<number>> {
  if (!assignmentIds.length) return new Set()
  const rows = await payload.find({ collection: 'volunteer-hours', where: { and: [{ assignment: { in: [...assignmentIds] } }, { voidedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true, req: req as PayloadRequest })
  return new Set((rows.docs as unknown as Doc[]).map((r) => idOf(r.assignment)).filter((n): n is number => n !== null))
}

const isUniqueViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string }; message?: string }
  return e?.code === '23505' || e?.cause?.code === '23505' || /duplicate key|unique constraint/i.test(String(e?.message ?? ''))
}

// ---- pages ------------------------------------------------------------------------------------------------------------------

export type WeekSummary = WeekRow & { slots: number; filled: number; empty: number; people: number }
export type VolunteerLink = { id: number; name: string; url: string }
export type VolunteersPage = {
  season: string
  seasons: string[]
  weeks: WeekSummary[]
  /** Game days in the fixtures that do not have a week yet. */
  newDates: string[]
  shiftTypes: { key: string; label: string }[]
  links: VolunteerLink[]
  isAdmin: boolean
}

function seasonChoices(today: string, known: readonly string[]): string[] {
  const cur = seasonOfClubDate(today)
  const prev = seasonOfClubDate(`${cur.startYear - 1}-${today.slice(5)}`)
  const next = seasonOfClubDate(`${cur.startYear + 1}-${today.slice(5)}`)
  return [...new Set([next.name, cur.name, prev.name, ...known])].sort().reverse()
}

async function seasonFixtureDates(payload: Payload, season: string): Promise<{ localDate: string; isHome: boolean; status: string }[]> {
  const range = seasonRange(season)
  if (!range) return []
  const res = await payload.find({
    collection: 'selection-fixtures',
    where: { and: [{ localDate: { greater_than_equal: range.from } }, { localDate: { less_than_equal: range.to } }, { isHome: { equals: true } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { localDate: true, isHome: true, status: true },
  })
  return (res.docs as unknown as { localDate: string; isHome?: boolean; status?: string }[]).map((f) => ({ localDate: f.localDate, isHome: f.isHome === true, status: f.status ?? 'upcoming' }))
}

export async function getVolunteersPage(user: unknown, seasonParam: string | null): Promise<VolunteersPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const season = seasonParam && isSeasonName(seasonParam) ? seasonParam : seasonOfClubDate(today).name
  const settings = await getOfficeSettings(user)
  const weekDocs = (await payload.find({ collection: 'volunteer-weeks', where: { season: { equals: season } }, pagination: false, depth: 0, sort: 'date', overrideAccess: true })).docs as unknown as Doc[]
  const weeks = weekDocs.map(toWeek)
  const weekIds = weeks.map((w) => w.id)
  const shifts = weekIds.length ? ((await payload.find({ collection: 'volunteer-shifts', where: { week: { in: weekIds } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]).map(toShift) : []
  const assignments = shifts.length ? ((await payload.find({ collection: 'volunteer-assignments', where: { shift: { in: shifts.map((s) => s.id) } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]).map(toAssignment) : []
  const summaries: WeekSummary[] = weeks.map((w) => {
    const ws = shifts.filter((s) => s.weekId === w.id)
    const ids = new Set(ws.map((s) => s.id))
    const wa = assignments.filter((a) => ids.has(a.shiftId))
    return { ...w, ...fillStatus(ws, wa), people: new Set(wa.filter((a) => isActiveState(a.state)).map((a) => a.memberId)).size }
  })
  const fixtures = await seasonFixtureDates(payload, season)
  const newDates = weekDatesFromFixtures(fixtures, season, weeks.map((w) => w.date))
  const known = (await payload.find({ collection: 'volunteer-weeks', pagination: false, depth: 0, select: { season: true }, overrideAccess: true })).docs as unknown as { season: string }[]

  // Personal links for the people the roster can use. The names come from the scoped projection; the version is read only for them.
  const names = await listMemberNames(user, 'roster')
  const versions = names.length
    ? new Map(
        ((await payload.find({ collection: 'members', where: { id: { in: names.map((n) => n.id) } }, pagination: false, depth: 0, select: { volunteerLinkVersion: true }, overrideAccess: true })).docs as unknown as { id: number; volunteerLinkVersion?: number | null }[]).map((m) => [m.id, m.volunteerLinkVersion ?? 0]),
      )
    : new Map<number, number>()
  const origin = payload.config.serverURL || ''
  const links = names.map((n) => ({ id: n.id, name: n.displayName, url: `${origin}${volunteerPath(volunteerToken(n.id, versions.get(n.id) ?? 0))}` }))
  return {
    season,
    seasons: seasonChoices(today, known.map((k) => k.season)),
    weeks: summaries,
    newDates,
    shiftTypes: settings.shiftTypes.map((t) => ({ key: t.key, label: t.label })),
    links,
    isAdmin: adminOnly(user),
  }
}

export type WeekAssignment = { id: number; memberId: number; name: string; state: AssignmentState; hours: number; /** Admin only. */ kind?: HoursKind; answer: AvailabilityState | null }
export type WeekShift = ShiftRow & { assignments: WeekAssignment[]; candidates: Candidate[]; slotsEmpty: number }
export type WeekPage = {
  week: WeekRow
  shifts: WeekShift[]
  fill: { slots: number; filled: number; empty: number }
  warnings: (RosterWarning & { text: string })[]
  answers: { memberId: number; name: string; state: AvailabilityState; note: string | null }[]
  shiftTypes: { key: string; label: string; defaultHours: number; defaultSlots: number }[]
  isAdmin: boolean
  /** Admin only: hours already posted for this week, live and voided shown apart. */
  posted: { live: number; voided: number } | null
}

export async function getWeekPage(user: unknown, weekId: number): Promise<WeekPage | null> {
  if (!staffOnly(user) || !Number.isInteger(weekId)) return null
  const payload = await getPayloadClient()
  const loaded = await loadWeek(payload, weekId)
  if (!loaded) return null
  const { week, shifts, assignments } = loaded
  const admin = adminOnly(user)
  const today = currentClubDate()
  const settings = await getOfficeSettings(user)
  const roster = await listMemberNames(user, 'roster')

  const availabilityDocs = (await payload.find({ collection: 'volunteer-availability', where: { week: { equals: weekId } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const answerOf = new Map<number, { state: AvailabilityState; preferred: string[]; note: string | null }>()
  for (const a of availabilityDocs) {
    const m = idOf(a.member)
    if (m !== null) answerOf.set(m, { state: a.state as AvailabilityState, preferred: Array.isArray(a.preferredShiftKeys) ? (a.preferredShiftKeys as string[]) : [], note: typeof a.note === 'string' ? a.note : null })
  }
  const answerStates = new Map([...answerOf].map(([k, v]) => [k, v.state]))

  // Season load, paid and volunteer not told apart: the shifts each person is rostered on this season.
  const seasonWeeks = (await payload.find({ collection: 'volunteer-weeks', where: { season: { equals: week.season } }, pagination: false, depth: 0, select: { season: true }, overrideAccess: true })).docs as unknown as Doc[]
  const seasonShifts = seasonWeeks.length ? ((await payload.find({ collection: 'volunteer-shifts', where: { week: { in: seasonWeeks.map((w) => w.id as number) } }, pagination: false, depth: 0, select: { week: true }, overrideAccess: true })).docs as unknown as Doc[]) : []
  const seasonAssignments = seasonShifts.length ? ((await payload.find({ collection: 'volunteer-assignments', where: { and: [{ shift: { in: seasonShifts.map((s) => s.id as number) } }, { state: { in: ['rostered', 'confirmed'] } }] }, pagination: false, depth: 0, select: { member: true }, overrideAccess: true })).docs as unknown as Doc[]) : []
  const load = new Map<number, number>()
  for (const a of seasonAssignments) {
    const m = idOf(a.member)
    if (m !== null) load.set(m, (load.get(m) ?? 0) + 1)
  }

  const names = await namesFor(payload, [...new Set([...assignments.map((a) => a.memberId), ...answerOf.keys()])], today)
  const nameOf = (id: number): string => names.get(id) ?? 'Unknown person'
  const kinds = new Map<number, HoursKind>()
  if (admin) {
    const rows = assignments.length ? ((await payload.find({ collection: 'volunteer-assignments', where: { id: { in: assignments.map((a) => a.id) } }, pagination: false, depth: 0, select: { kind: true }, user, overrideAccess: false })).docs as unknown as Doc[]) : []
    for (const r of rows) if (isHoursKind(r.kind)) kinds.set(r.id as number, r.kind)
  }

  const detail: WeekShift[] = shifts.map((s) => {
    const mine = assignments.filter((a) => a.shiftId === s.id)
    const taken = new Set(mine.filter((a) => isActiveState(a.state)).map((a) => a.memberId))
    const candidates = rankCandidates(roster.filter((p) => !taken.has(p.id)).map((p) => ({ id: p.id, name: p.displayName })), answerOf, load, s.shiftTypeKey)
    return {
      ...s,
      assignments: mine.map((a) => ({ id: a.id, memberId: a.memberId, name: nameOf(a.memberId), state: a.state, hours: a.hours, ...(admin ? { kind: kinds.get(a.id) ?? a.kind } : {}), answer: answerOf.get(a.memberId)?.state ?? null })),
      candidates,
      slotsEmpty: Math.max(0, s.slots - mine.filter((a) => isActiveState(a.state)).length),
    }
  })
  const warnings = rosterWarnings(shifts, assignments, answerStates).map((w) => ({ ...w, text: officeCopy.volunteers.warning(w, w.memberId !== null ? nameOf(w.memberId) : '', shifts.find((s) => s.id === w.shiftId)?.labelSnapshot ?? '') }))

  let posted: WeekPage['posted'] = null
  if (admin) {
    const rows = (await payload.find({ collection: 'volunteer-hours', where: { week: { equals: weekId } }, pagination: false, depth: 0, select: { hours: true, voidedAt: true }, user, overrideAccess: false })).docs as unknown as Doc[]
    posted = { live: rows.filter((r) => !r.voidedAt).reduce((s, r) => s + num(r.hours), 0), voided: rows.filter((r) => r.voidedAt).reduce((s, r) => s + num(r.hours), 0) }
  }
  return {
    week,
    shifts: detail,
    fill: fillStatus(shifts, assignments),
    warnings,
    answers: [...answerOf].map(([memberId, a]) => ({ memberId, name: nameOf(memberId), state: a.state, note: a.note })).sort((a, b) => a.name.localeCompare(b.name)),
    shiftTypes: settings.shiftTypes.map((t) => ({ key: t.key, label: t.label, defaultHours: t.defaultHours, defaultSlots: t.defaultSlots })),
    isAdmin: admin,
    posted,
  }
}

// ---- landing and notification -----------------------------------------------------------------------------------------------

export type NextGameDay = { weekId: number; date: string; label: string | null; empty: number; slots: number; daysAway: number }

/** The next game day that has not happened yet and has a roster (draft or open), for the landing tile and the notification. */
export async function nextGameDay(user: unknown): Promise<NextGameDay | null> {
  if (!staffOnly(user)) return null
  try {
    const payload = await getPayloadClient()
    const today = currentClubDate()
    const weeks = await payload.find({ collection: 'volunteer-weeks', where: { and: [{ date: { greater_than_equal: `${today}T00:00:00.000Z` } }, { status: { not_equals: 'confirmed' } }] }, sort: 'date', limit: 1, depth: 0, overrideAccess: true })
    const doc = weeks.docs[0] as unknown as Doc | undefined
    if (!doc) return null
    const w = toWeek(doc)
    const loaded = await loadWeek(payload, w.id)
    if (!loaded) return null
    const fill = fillStatus(loaded.shifts, loaded.assignments)
    const days = Math.round((Date.parse(`${w.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    return { weekId: w.id, date: w.date, label: w.label, empty: fill.empty, slots: fill.slots, daysAway: days }
  } catch (err) {
    console.warn('[office] volunteer summary unavailable:', (err as Error).message)
    return null
  }
}

// ---- roster writes ----------------------------------------------------------------------------------------------------------

export async function createWeeksForSeason(user: unknown, season: string): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (!isSeasonName(season)) return fail('season')
  const payload = await getPayloadClient()
  const existing = ((await payload.find({ collection: 'volunteer-weeks', where: { season: { equals: season } }, pagination: false, depth: 0, select: { date: true }, overrideAccess: true })).docs as unknown as Doc[]).map((d) => day(d.date))
  const dates = weekDatesFromFixtures(await seasonFixtureDates(payload, season), season, existing)
  let n = 0
  for (const date of dates) {
    try {
      await payload.create({ collection: 'volunteer-weeks', data: { season, date: noon(date), status: 'draft' } as never, overrideAccess: true, depth: 0 })
      n++
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
    }
  }
  return done('weeks', n)
}

export async function addWeek(user: unknown, raw: { date: unknown; label: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const date = isIsoDate(raw.date) ? raw.date : ''
  const existing = date ? ((await payload.find({ collection: 'volunteer-weeks', where: { date: { equals: noon(date) } }, limit: 1, depth: 0, overrideAccess: true })).docs as unknown as Doc[]).map((d) => day(d.date)) : []
  const checked = validateWeekInput(raw, existing)
  if (!checked.ok) return fail(checked.error)
  try {
    await payload.create({ collection: 'volunteer-weeks', data: { season: seasonOfClubDate(checked.date).name, date: noon(checked.date), label: checked.label, status: 'draft' } as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    return fail(isUniqueViolation(err) ? 'duplicate' : 'save')
  }
  return done('week-added')
}

export async function setWeekStatus(user: unknown, weekId: number, status: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (status !== 'draft' && status !== 'open') return fail('state')
  const payload = await getPayloadClient()
  const loaded = await loadWeek(payload, weekId)
  if (!loaded) return fail('not-found')
  if (loaded.week.status === 'confirmed') return fail('frozen')
  await payload.update({ collection: 'volunteer-weeks', id: weekId, data: { status } as never, overrideAccess: true, depth: 0 })
  return done(status === 'open' ? 'week-open' : 'week-draft')
}

export async function deleteWeek(user: unknown, weekId: number): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const loaded = await loadWeek(payload, weekId)
  if (!loaded) return fail('not-found')
  if (loaded.week.status === 'confirmed') return fail('frozen')
  if (loaded.assignments.length > 0) return fail('has-people')
  const hours = await payload.count({ collection: 'volunteer-hours', where: { week: { equals: weekId } }, overrideAccess: true })
  if (hours.totalDocs > 0) return fail('has-people')
  await inTransaction(payload, async (req) => {
    const r = req as PayloadRequest
    await payload.delete({ collection: 'volunteer-availability', where: { week: { equals: weekId } }, overrideAccess: true, req: r })
    await payload.delete({ collection: 'volunteer-shifts', where: { week: { equals: weekId } }, overrideAccess: true, req: r })
    await payload.delete({ collection: 'volunteer-weeks', id: weekId, overrideAccess: true, req: r })
  })
  return done('week-deleted')
}

export async function addShift(user: unknown, raw: { weekId: unknown; shiftTypeKey: unknown; hours?: unknown; slots?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const weekId = posInt(raw.weekId)
  if (weekId === null) return fail('not-found')
  const payload = await getPayloadClient()
  const loaded = await loadWeek(payload, weekId)
  if (!loaded) return fail('not-found')
  if (loaded.week.status === 'confirmed') return fail('frozen')
  const settings = await getOfficeSettings(user)
  const type = settings.shiftTypes.find((t) => t.key === raw.shiftTypeKey)
  if (!type) return fail('shift')
  const hours = raw.hours === undefined || raw.hours === '' ? type.defaultHours : Number(String(raw.hours).replace(',', '.'))
  if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) return fail('hours')
  const slots = raw.slots === undefined || raw.slots === '' ? type.defaultSlots : Number(raw.slots)
  if (!Number.isInteger(slots) || slots < 1 || slots > 50) return fail('shift')
  await payload.create({ collection: 'volunteer-shifts', data: { week: weekId, shiftTypeKey: type.key, labelSnapshot: type.label, hours: Math.round(hours * 100) / 100, slots } as never, overrideAccess: true, depth: 0 })
  return done('shift-added')
}

export async function removeShift(user: unknown, shiftId: number): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const shift = await payload.findByID({ collection: 'volunteer-shifts', id: shiftId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!shift) return fail('not-found')
  const loaded = await loadWeek(payload, idOf((shift as unknown as Doc).week) ?? 0)
  if (loaded?.week.status === 'confirmed') return fail('frozen')
  const rows = await payload.count({ collection: 'volunteer-assignments', where: { shift: { equals: shiftId } }, overrideAccess: true })
  if (rows.totalDocs > 0) return fail('has-people')
  await payload.delete({ collection: 'volunteer-shifts', id: shiftId, overrideAccess: true })
  return done('shift-removed')
}

/** Who can be rostered: exactly the people the roster screen offers. Keeps a hand-made form post inside the same list. */
async function rosterable(user: unknown, memberId: number): Promise<boolean> {
  return (await listMemberNames(user, 'roster')).some((n) => n.id === memberId)
}

export async function assign(user: unknown, raw: { shiftId: unknown; memberId: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const shiftId = posInt(raw.shiftId)
  const memberId = posInt(raw.memberId)
  if (shiftId === null) return fail('not-found')
  if (memberId === null || !(await rosterable(user, memberId))) return fail('member')
  const payload = await getPayloadClient()
  const shiftDoc = await payload.findByID({ collection: 'volunteer-shifts', id: shiftId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!shiftDoc) return fail('not-found')
  const shift = toShift(shiftDoc as unknown as Doc)
  const loaded = await loadWeek(payload, shift.weekId)
  if (!loaded) return fail('not-found')
  if (loaded.week.status === 'confirmed') return fail('frozen')
  // Paid or volunteer comes from the shift type in settings, never from the form.
  const settings = await getOfficeSettings(user)
  const kind: HoursKind = settings.shiftTypes.find((t) => t.key === shift.shiftTypeKey)?.kind ?? 'volunteer'
  const found = await payload.find({ collection: 'volunteer-assignments', where: { and: [{ shift: { equals: shiftId } }, { member: { equals: memberId } }] }, limit: 1, depth: 0, overrideAccess: true })
  const existing = found.docs[0] as unknown as Doc | undefined
  if (existing) {
    if (isActiveState(existing.state as AssignmentState)) return done('assigned')
    await payload.update({ collection: 'volunteer-assignments', id: existing.id as number, data: { state: 'rostered', kind, hours: shift.hours } as never, overrideAccess: true, depth: 0 })
    return done('assigned')
  }
  try {
    await payload.create({ collection: 'volunteer-assignments', data: { shift: shiftId, member: memberId, kind, hours: shift.hours, state: 'rostered' } as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    if (!isUniqueViolation(err)) return fail('save')
  }
  return done('assigned')
}

async function assignmentContext(payload: Payload, assignmentId: number) {
  const doc = await payload.findByID({ collection: 'volunteer-assignments', id: assignmentId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!doc) return null
  const a = toAssignment(doc as unknown as Doc)
  const shiftDoc = await payload.findByID({ collection: 'volunteer-shifts', id: a.shiftId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!shiftDoc) return null
  const shift = toShift(shiftDoc as unknown as Doc)
  const week = await payload.findByID({ collection: 'volunteer-weeks', id: shift.weekId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!week) return null
  return { a, shift, week: toWeek(week as unknown as Doc) }
}

/** Removes someone from a shift. With no hours history the row is deleted (a clean undo); otherwise it is marked cancelled. */
export async function unassign(user: unknown, assignmentId: number): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const ctx = await assignmentContext(payload, assignmentId)
  if (!ctx) return fail('not-found')
  if (ctx.week.status === 'confirmed') return fail('frozen')
  const history = await payload.count({ collection: 'volunteer-hours', where: { assignment: { equals: assignmentId } }, overrideAccess: true })
  if (history.totalDocs > 0) await payload.update({ collection: 'volunteer-assignments', id: assignmentId, data: { state: 'cancelled' } as never, overrideAccess: true, depth: 0 })
  else await payload.delete({ collection: 'volunteer-assignments', id: assignmentId, overrideAccess: true })
  return done('unassigned')
}

/** Admin only: change one assignment between paid and volunteer. Editors never post this. */
export async function setAssignmentKind(user: unknown, assignmentId: number, kind: unknown): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  if (!isHoursKind(kind)) return fail('kind')
  const payload = await getPayloadClient()
  const ctx = await assignmentContext(payload, assignmentId)
  if (!ctx) return fail('not-found')
  if (ctx.week.status === 'confirmed') return fail('frozen')
  await payload.update({ collection: 'volunteer-assignments', id: assignmentId, data: { kind } as never, overrideAccess: true, depth: 0 })
  return done('kind')
}

const hourData = (p: HourPost, weekId: number, userId: number) =>
  ({ member: p.memberId, date: noon(p.date), hours: p.hours, kind: p.kind, shiftTypeKey: p.shiftTypeKey, week: weekId, assignment: p.assignmentId, source: 'roster', recordedBy: userId }) as never

/** In a confirmed week the only change is a no-show (voids the live row) and putting that back (posts a new live row). */
export async function setAssignmentState(user: unknown, assignmentId: number, state: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (state !== 'no-show' && state !== 'confirmed') return fail('state')
  const payload = await getPayloadClient()
  const ctx = await assignmentContext(payload, assignmentId)
  if (!ctx) return fail('not-found')
  if (ctx.week.status !== 'confirmed') return fail('not-confirmed')
  if (ctx.a.state === state) return done('state')
  if (state === 'no-show' && ctx.a.state !== 'confirmed') return fail('state')
  if (state === 'confirmed' && ctx.a.state !== 'no-show') return fail('state')
  try {
    await inTransaction(payload, async (req) => {
      const r = req as PayloadRequest
      if (state === 'no-show') {
        const live = await payload.find({ collection: 'volunteer-hours', where: { and: [{ assignment: { equals: assignmentId } }, { voidedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true, req: r })
        for (const row of live.docs) await payload.update({ collection: 'volunteer-hours', id: row.id, data: { voidedAt: new Date().toISOString(), voidedBy: user.id, voidReason: 'Did not turn up' } as never, overrideAccess: true, depth: 0, req: r })
      } else if (!(await liveAssignmentIds(payload, [assignmentId], r)).has(assignmentId)) {
        await payload.create({ collection: 'volunteer-hours', data: hourData({ assignmentId, memberId: ctx.a.memberId, hours: ctx.a.hours, kind: ctx.a.kind, shiftTypeKey: ctx.shift.shiftTypeKey, date: ctx.week.date }, ctx.week.id, user.id), overrideAccess: true, depth: 0, req: r })
      }
      await payload.update({ collection: 'volunteer-assignments', id: assignmentId, data: { state } as never, overrideAccess: true, depth: 0, req: r })
    })
  } catch (err) {
    console.error('[office] assignment state change failed:', (err as Error).message)
    return fail('save')
  }
  return done('state')
}

/** Posts the week's hours (one live row per rostered or confirmed assignment) and freezes the roster. Safe to run twice. */
export async function confirmWeek(user: unknown, weekId: number): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const loaded = await loadWeek(payload, weekId)
  if (!loaded) return fail('not-found')
  if (loaded.week.status === 'confirmed') return fail('already-confirmed')
  try {
    await inTransaction(payload, async (req) => {
      const r = req as PayloadRequest
      const live = await liveAssignmentIds(payload, loaded.assignments.map((a) => a.id), r)
      const plan = planConfirm(loaded.week.date, loaded.shifts, loaded.assignments, live)
      for (const p of plan.post) await payload.create({ collection: 'volunteer-hours', data: hourData(p, weekId, user.id), overrideAccess: true, depth: 0, req: r })
      for (const id of plan.becomeConfirmed) await payload.update({ collection: 'volunteer-assignments', id, data: { state: 'confirmed' } as never, overrideAccess: true, depth: 0, req: r })
      await payload.update({ collection: 'volunteer-weeks', id: weekId, data: { status: 'confirmed', confirmedAt: new Date().toISOString(), confirmedBy: user.id } as never, overrideAccess: true, depth: 0, req: r })
    })
  } catch (err) {
    console.error('[office] confirm week failed:', (err as Error).message)
    return fail('save')
  }
  return done('confirmed')
}

/** Voids the week's roster hours (they stay as history) and unlocks the roster. Confirming again posts fresh rows. */
export async function reopenWeek(user: unknown, weekId: number): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const loaded = await loadWeek(payload, weekId)
  if (!loaded) return fail('not-found')
  if (loaded.week.status !== 'confirmed') return fail('not-confirmed')
  try {
    await inTransaction(payload, async (req) => {
      const r = req as PayloadRequest
      const live = await payload.find({ collection: 'volunteer-hours', where: { and: [{ week: { equals: weekId } }, { source: { equals: 'roster' } }, { voidedAt: { exists: false } }] }, pagination: false, depth: 0, overrideAccess: true, req: r })
      for (const row of live.docs) await payload.update({ collection: 'volunteer-hours', id: row.id, data: { voidedAt: new Date().toISOString(), voidedBy: user.id, voidReason: 'Week reopened' } as never, overrideAccess: true, depth: 0, req: r })
      for (const id of planReopen(loaded.assignments).backToRostered) await payload.update({ collection: 'volunteer-assignments', id, data: { state: 'rostered' } as never, overrideAccess: true, depth: 0, req: r })
      await payload.update({ collection: 'volunteer-weeks', id: weekId, data: { status: 'open', confirmedAt: null, confirmedBy: null } as never, overrideAccess: true, depth: 0, req: r })
    })
  } catch (err) {
    console.error('[office] reopen week failed:', (err as Error).message)
    return fail('save')
  }
  return done('reopened')
}

/** Makes a new link for one volunteer: the old address stops working. The committee can do this; it changes nothing else. */
export async function rotateVolunteerLink(user: unknown, memberId: number): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (!(await rosterable(user, memberId))) return fail('member')
  const payload = await getPayloadClient()
  await payload.update({ collection: 'members', id: memberId, data: {} as never, context: { bumpVolunteerLinks: true }, overrideAccess: true, depth: 0 })
  return done('rotated')
}

// ---- hours: admin writes ----------------------------------------------------------------------------------------------------

export async function addManualHours(user: unknown, raw: Parameters<typeof validateManualHours>[0]): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const settings = await getOfficeSettings(user)
  const checked = validateManualHours(raw, settings.shiftTypes.map((t) => t.key), currentClubDate())
  if (!checked.ok) return fail(checked.error === 'shift' ? 'shift' : checked.error)
  const payload = await getPayloadClient()
  if (!(await rosterable(user, checked.memberId))) return fail('member')
  await payload.create({
    collection: 'volunteer-hours',
    data: { member: checked.memberId, date: noon(checked.date), hours: checked.hours, kind: checked.kind, shiftTypeKey: checked.shiftTypeKey, source: 'manual', note: checked.note, recordedBy: user.id } as never,
    overrideAccess: true,
    depth: 0,
  })
  return done('hours')
}

export async function voidHours(user: unknown, raw: { id: unknown; reason: unknown }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const id = posInt(raw.id)
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (id === null) return fail('not-found')
  if (!reason || reason.length > 300) return fail('reason')
  const payload = await getPayloadClient()
  const row = await payload.findByID({ collection: 'volunteer-hours', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!row) return fail('not-found')
  if ((row as unknown as Doc).voidedAt) return done('voided')
  await payload.update({ collection: 'volunteer-hours', id, data: { voidedAt: new Date().toISOString(), voidedBy: user.id, voidReason: reason } as never, overrideAccess: true, depth: 0 })
  return done('voided')
}

// ---- hours report -----------------------------------------------------------------------------------------------------------

export type HoursQuery = { season?: string | null; from?: string | null; to?: string | null }
export type HoursReport = {
  label: string
  from: string
  to: string
  season: string
  seasons: string[]
  aggregate: KindSummary[]
  shiftLabels: Record<string, string>
  isAdmin: boolean
  /** Admin only. */
  people: { memberId: number; name: string; volunteer: number; paid: number }[] | null
  recent: { id: number; name: string; date: string; hours: number; kind: HoursKind; shiftLabel: string; source: string; note: string | null }[] | null
  voidedCount: number | null
  roster: { id: number; displayName: string }[] | null
}

function resolveRange(q: HoursQuery, today: string): { from: string; to: string; season: string; label: string } {
  if (q.from && q.to && isIsoDate(q.from) && isIsoDate(q.to) && q.from <= q.to) return { from: q.from, to: q.to, season: '', label: `${q.from} to ${q.to}` }
  const season = q.season && isSeasonName(q.season) ? q.season : seasonOfClubDate(today).name
  const r = seasonRange(season)!
  return { from: r.from, to: r.to, season, label: `Season ${season}` }
}

async function liveHourRows(payload: Payload, from: string, to: string): Promise<{ id: number; row: HoursRow; doc: Doc }[]> {
  const docs = (await payload.find({
    collection: 'volunteer-hours',
    where: { and: [{ date: { greater_than_equal: `${from}T00:00:00.000Z` } }, { date: { less_than_equal: `${to}T23:59:59.999Z` } }, { voidedAt: { exists: false } }] },
    pagination: false,
    depth: 0,
    sort: '-date',
    overrideAccess: true,
  })).docs as unknown as Doc[]
  return docs.map((d) => ({ id: d.id as number, doc: d, row: { memberId: idOf(d.member) ?? 0, date: day(d.date), hours: num(d.hours), kind: isHoursKind(d.kind) ? d.kind : 'volunteer', shiftTypeKey: typeof d.shiftTypeKey === 'string' && d.shiftTypeKey ? d.shiftTypeKey : 'other' } }))
}

/**
 * The hours report. Everyone on the committee gets the name-free aggregate with the small-count rule; per-person totals, the ledger
 * rows and the entry form are for admins only. Voided rows, no-shows and unconfirmed weeks are never in it.
 */
export async function getHoursReport(user: unknown, q: HoursQuery): Promise<HoursReport | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const range = resolveRange(q, today)
  const settings = await getOfficeSettings(user)
  const rows = await liveHourRows(payload, range.from, range.to)
  const shiftLabels = Object.fromEntries([...settings.shiftTypes.map((t) => [t.key, t.label]), ['other', 'Other work']])
  const admin = adminOnly(user)
  const known = (await payload.find({ collection: 'volunteer-weeks', pagination: false, depth: 0, select: { season: true }, overrideAccess: true })).docs as unknown as { season: string }[]
  const base = { label: range.label, from: range.from, to: range.to, season: range.season, seasons: seasonChoices(today, known.map((k) => k.season)), aggregate: aggregateHours(rows.map((r) => r.row)), shiftLabels, isAdmin: admin }
  if (!admin) return { ...base, people: null, recent: null, voidedCount: null, roster: null }
  const names = await fullNamesFor(payload, rows.map((r) => r.row.memberId))
  const people = hoursByPerson(rows.map((r) => r.row)).map((p) => ({ ...p, name: names.get(p.memberId) ?? 'Unknown person' })).sort((a, b) => a.name.localeCompare(b.name))
  const voided = await payload.count({ collection: 'volunteer-hours', where: { and: [{ date: { greater_than_equal: `${range.from}T00:00:00.000Z` } }, { date: { less_than_equal: `${range.to}T23:59:59.999Z` } }, { voidedAt: { exists: true } }] }, overrideAccess: true })
  return {
    ...base,
    people,
    recent: rows.slice(0, 40).map((r) => ({ id: r.id, name: names.get(r.row.memberId) ?? 'Unknown person', date: r.row.date, hours: r.row.hours, kind: r.row.kind, shiftLabel: shiftLabels[r.row.shiftTypeKey] ?? r.row.shiftTypeKey, source: String(r.doc.source ?? ''), note: typeof r.doc.note === 'string' ? r.doc.note : null })),
    voidedCount: voided.totalDocs,
    roster: await listMemberNames(user, 'roster'),
  }
}

export const HOURS_EXPORT_SPEC = { scope: ['aggregate', 'person'], seasonStartYear: 'number', range: ['season', 'dates'] } as const

/** The hours CSV (called only from `auditedExport`, after the admin check). The aggregate keeps the small-count rule; per person is names and totals. */
export async function hoursExportTable(user: TypedUser, q: HoursQuery, scope: 'aggregate' | 'person'): Promise<{ header: string[]; rows: (string | number)[][] }> {
  const payload = await getPayloadClient()
  const range = resolveRange(q, currentClubDate())
  const settings: OfficeSettings = await getOfficeSettings(user)
  const rows = await liveHourRows(payload, range.from, range.to)
  if (scope === 'person') {
    const names = await fullNamesFor(payload, rows.map((r) => r.row.memberId))
    const out = hoursByPerson(rows.map((r) => r.row)).map((p) => ({ ...p, name: names.get(p.memberId) ?? 'Unknown person' })).sort((a, b) => a.name.localeCompare(b.name))
    return { header: ['Name', 'Volunteer hours', 'Paid hours'], rows: out.map((p) => [p.name, p.volunteer, p.paid]) }
  }
  const labels = Object.fromEntries(settings.shiftTypes.map((t) => [t.key, t.label]))
  const out: (string | number)[][] = []
  for (const k of aggregateHours(rows.map((r) => r.row))) {
    const kind = k.kind === 'paid' ? 'Paid' : 'Volunteer'
    if (k.state === 'none') continue
    if (k.state === 'hidden') {
      out.push([kind, 'All', 'Fewer than 3 people', ''])
      continue
    }
    out.push([kind, 'All', k.hours ?? 'Hidden (small groups)', k.people])
    for (const [dimension, t] of [['Job', k.byType], ['Month', k.byMonth]] as const) {
      for (const c of t.cells) out.push([kind, `${dimension}: ${dimension === 'Job' ? (labels[c.key] ?? c.key) : c.key}`, c.hours, c.people])
      if (t.other) out.push([kind, `${dimension}: Other`, t.other.hours ?? 'Fewer than 3 people', t.other.people ?? ''])
    }
  }
  return { header: ['Kind', 'Group', 'Hours', 'People'], rows: out }
}
