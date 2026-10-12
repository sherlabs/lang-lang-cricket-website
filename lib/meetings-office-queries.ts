import 'server-only'
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { CLUB_LOCALE } from '@/config/site'
import { peopleNames, personExists } from '@/lib/people-queries'
import { currentClubDate } from '@/lib/selection/club-date'
import { isAdminUser, isStaffUser } from '@/payload/access'
import { sanitiseSummary } from './office/audit'
import { writeAudit } from './office/audit-write'
import { inTransaction } from './office/fee-load'
import { isOfficeBearer } from './office/office-bearer'
import {
  actionStanding,
  buildMinutes,
  buildRestrictedAnnex,
  dateAsNumber,
  defaultMeetingRestricted,
  effectiveRestricted,
  isActionStatus,
  isAttendanceState,
  isIsoDay,
  itemsFromTemplate,
  OFFICE_FILE_MAX_BYTES,
  parseId,
  planHandover,
  safeFileName,
  validateActionInput,
  validateDocument,
  validateMotion,
  validateNewMeeting,
  validateNote,
  validateTitle,
  type ActionStanding,
  type ActionStatus,
  type AttendanceState,
  type DocumentCategory,
  type HandoverChange,
  type ItemKind,
  type MeetingError,
  type MeetingKind,
  type MeetingNotice,
  type MeetingStatus,
  type MinutesInput,
  type MinutesItem,
  type MotionResult,
} from './office/meetings'
import { STARTER_TEMPLATES } from './office/starter-meetings'
import { resolveOfficeSettings } from './office/settings'

/**
 * The data layer for committee meetings, seats and office-bearer documents (wave D spec section 6). Every function checks its caller
 * itself. Reads that return meeting data use the collection access rules (`overrideAccess: false` with the caller), so a restricted
 * row is invisible to anyone who is not an office-bearer without this file having to remember it. Writes go through here only (nobody
 * writes over REST), use the access override after the check, and keep each child's `effectiveRestricted` copy in step.
 */
/** What a handover audit row may hold: ids and a number only, never a name. */
const HANDOVER_SUMMARY = { seat: 'number', from: 'number', to: 'number', meeting: 'number', date: 'number' } as const
const staffOnly = (user: unknown): user is TypedUser => isStaffUser(user as never)
const adminOnly = (user: unknown): user is TypedUser => isAdminUser(user as never)
type Doc = Record<string, unknown>
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const numOrNull = (v: unknown): number | null => (typeof v === 'number' ? v : null)
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')

export type ActionResult = { ok: true; notice: MeetingNotice; id?: number; n?: number } | { ok: false; code: MeetingError }
const fail = (code: MeetingError): ActionResult => ({ ok: false, code })
const done = (notice: MeetingNotice, extra: { id?: number; n?: number } = {}): ActionResult => ({ ok: true, notice, ...extra })

const WHEN = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
/** Meeting times are stored as typed (wall clock as UTC), so they are shown in UTC to come back exactly as typed. */
export const meetingWhen = (iso: string): string => WHEN.format(new Date(iso))
const DAY = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
export const dueLabel = (isoDay: string): string => DAY.format(new Date(`${isoDay}T12:00:00Z`))

async function bearerOf(payload: Payload, user: unknown): Promise<boolean> {
  return isOfficeBearer(user as never, { payload })
}

/** The meeting, only if this caller may see it (restricted meetings are invisible to non-bearers). */
async function loadMeeting(payload: Payload, user: TypedUser, id: number): Promise<Doc | null> {
  return (await payload.findByID({ collection: 'meetings', id, user, overrideAccess: false, depth: 0 }).catch(() => null)) as unknown as Doc | null
}

async function seatNames(payload: Payload): Promise<Map<number, { title: string; holder: string | null }>> {
  const res = await payload.find({ collection: 'committee-seats', pagination: false, depth: 1, sort: 'sortOrder', overrideAccess: true })
  const out = new Map<number, { title: string; holder: string | null }>()
  for (const s of res.docs as unknown as Doc[]) {
    const holder = s.holder && typeof s.holder === 'object' ? str((s.holder as Doc).name) : ''
    out.set(s.id as number, { title: str(s.title), holder: holder || null })
  }
  return out
}

// ---- restriction copies -----------------------------------------------------------------------------------------------------

/** Recomputes `effectiveRestricted` on a meeting's items, attendance, motions and actions. Call after any restriction change. */
async function resync(payload: Payload, meetingId: number, req: Partial<PayloadRequest>): Promise<void> {
  const r = req as PayloadRequest
  const meeting = (await payload.findByID({ collection: 'meetings', id: meetingId, depth: 0, overrideAccess: true, req: r })) as unknown as Doc
  const mr = Boolean(meeting.restricted)
  const where = { meeting: { equals: meetingId } }
  const items = (await payload.find({ collection: 'meeting-items', where, pagination: false, depth: 0, overrideAccess: true, req: r })).docs as unknown as Doc[]
  const itemRestricted = new Map<number, boolean>()
  for (const it of items) {
    const eff = effectiveRestricted(mr, Boolean(it.restricted))
    itemRestricted.set(it.id as number, eff)
    if (Boolean(it.effectiveRestricted) !== eff) await payload.update({ collection: 'meeting-items', id: it.id as number, data: { effectiveRestricted: eff }, overrideAccess: true, depth: 0, req: r })
  }
  for (const collection of ['meeting-motions', 'meeting-actions'] as const) {
    const rows = (await payload.find({ collection, where, pagination: false, depth: 0, overrideAccess: true, req: r })).docs as unknown as Doc[]
    for (const row of rows) {
      const itemId = idOf(row.item)
      const eff = itemId !== null && itemRestricted.has(itemId) ? (itemRestricted.get(itemId) as boolean) : mr
      if (Boolean(row.effectiveRestricted) !== eff) await payload.update({ collection, id: row.id as number, data: { effectiveRestricted: eff }, overrideAccess: true, depth: 0, req: r })
    }
  }
  const att = (await payload.find({ collection: 'meeting-attendance', where, pagination: false, depth: 0, overrideAccess: true, req: r })).docs as unknown as Doc[]
  for (const row of att) if (Boolean(row.effectiveRestricted) !== mr) await payload.update({ collection: 'meeting-attendance', id: row.id as number, data: { effectiveRestricted: mr }, overrideAccess: true, depth: 0, req: r })
}

/**
 * After a restriction change, a saved minutes text may still hold text that is now restricted (it was drafted or typed earlier).
 * Redraft it from the structured data so only what the meeting's current rules allow is stored. Hand edits to the saved text are
 * replaced, which is the safe side of a confidentiality change; the approval status is kept.
 */
async function redraftMinutes(payload: Payload, meetingId: number, req: Partial<PayloadRequest>): Promise<void> {
  const meeting = (await payload.findByID({ collection: 'meetings', id: meetingId, depth: 0, overrideAccess: true, req: req as PayloadRequest })) as unknown as Doc
  if (!str(meeting.minutesText).trim()) return
  const text = buildMinutes(await minutesInput(meetingId, req), { includeRestricted: Boolean(meeting.restricted) })
  await payload.update({ collection: 'meetings', id: meetingId, data: { minutesText: text }, overrideAccess: true, depth: 0, req: req as PayloadRequest })
}

// ---- pages ------------------------------------------------------------------------------------------------------------------

export type MeetingRow = { id: number; title: string; kind: MeetingKind; status: MeetingStatus; startsAt: string; when: string; restricted: boolean }
export type SeatView = { id: number; title: string; holderId: number | null; holderName: string | null; holderUserId: number | null; officeBearer: boolean; termStart: string | null; termEnd: string | null }
export type MeetingsPage = {
  upcoming: MeetingRow[]
  past: MeetingRow[]
  templates: { id: number; name: string; kind: MeetingKind }[]
  seats: SeatView[]
  /** Restricted meetings this caller cannot see; counted, never named. */
  hiddenMeetings: number
  bearer: boolean
  isAdmin: boolean
  annualName: string
  today: string
}

const toRow = (d: Doc): MeetingRow => ({ id: d.id as number, title: str(d.title), kind: d.kind as MeetingKind, status: d.status as MeetingStatus, startsAt: str(d.startsAt), when: meetingWhen(str(d.startsAt)), restricted: Boolean(d.restricted) })

async function loadSeats(payload: Payload): Promise<SeatView[]> {
  const res = await payload.find({ collection: 'committee-seats', pagination: false, depth: 1, sort: 'sortOrder', overrideAccess: true })
  return (res.docs as unknown as Doc[]).map((s) => ({
    id: s.id as number,
    title: str(s.title),
    holderId: idOf(s.holder),
    holderName: s.holder && typeof s.holder === 'object' ? str((s.holder as Doc).name) || null : null,
    holderUserId: idOf(s.holderUser),
    officeBearer: Boolean(s.officeBearer),
    termStart: s.termStart ? day(s.termStart) : null,
    termEnd: s.termEnd ? day(s.termEnd) : null,
  }))
}

export async function getMeetingsPage(user: unknown): Promise<MeetingsPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const [visible, all, templates, seats, settings] = await Promise.all([
    payload.find({ collection: 'meetings', pagination: false, depth: 0, sort: '-startsAt', user, overrideAccess: false }),
    payload.count({ collection: 'meetings', overrideAccess: true }),
    payload.find({ collection: 'meeting-templates', pagination: false, depth: 0, sort: 'name', overrideAccess: true }),
    loadSeats(payload),
    payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null),
  ])
  const rows = (visible.docs as unknown as Doc[]).map(toRow)
  const today = currentClubDate()
  const upcoming = rows.filter((m) => m.status !== 'closed' && m.status !== 'cancelled' && day(m.startsAt) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = rows.filter((m) => !upcoming.includes(m))
  return {
    upcoming,
    past,
    templates: (templates.docs as unknown as Doc[]).map((t) => ({ id: t.id as number, name: str(t.name), kind: t.kind as MeetingKind })),
    seats,
    hiddenMeetings: Math.max(0, all.totalDocs - rows.length),
    bearer: await bearerOf(payload, user),
    isAdmin: adminOnly(user),
    annualName: resolveOfficeSettings(settings).annualMeetingName,
    today,
  }
}

export type MotionView = { id: number; text: string; votesFor: number | null; votesAgainst: number | null; abstain: number | null; result: MotionResult | null; restricted: boolean }
export type ActionView = { id: number; text: string; owner: string | null; ownerSeatId: number | null; due: string | null; dueLabel: string | null; status: ActionStatus; standing: ActionStanding; meetingId: number; meetingTitle: string; restricted: boolean }
export type ItemView = { id: number; order: number; title: string; kind: ItemKind; notes: string; outcome: string; restricted: boolean; motions: MotionView[]; actions: ActionView[] }
export type AttendanceView = { id: number; name: string; personId: number | null; guest: boolean; state: AttendanceState }
export type MeetingPage = {
  meeting: MeetingRow & { venue: string | null; minutesText: string; minutesStatus: 'draft' | 'approved'; chairSeatId: number | null; minuteTakerSeatId: number | null; chair: string | null; minuteTaker: string | null; approvedAtMeetingId: number | null }
  items: ItemView[]
  attendance: AttendanceView[]
  presentCount: number
  /** Restricted items this caller cannot see; counted, never named. */
  hiddenItems: number
  /** Open actions from earlier meetings, shown under "Business arising". Restricted ones only for an office-bearer. */
  carried: ActionView[]
  /** The most recent earlier closed meeting whose minutes are still a draft (what "Approve previous minutes" approves). */
  previousMinutes: { id: number; title: string } | null
  seats: SeatView[]
  people: { id: number; name: string }[]
  bearer: boolean
  isAdmin: boolean
  annualName: string
  /** Admin only, annual meetings only: logins that can be linked to a seat. */
  logins: { id: number; label: string }[]
}

async function actionViews(payload: Payload, docs: Doc[], seats: Map<number, { title: string; holder: string | null }>, today: string, titles: Map<number, string>): Promise<ActionView[]> {
  const peopleIds = [...new Set(docs.map((a) => idOf(a.ownerPerson)).filter((n): n is number => n !== null))]
  const people = new Map<number, string>()
  for (const p of await peopleNames(peopleIds)) people.set(p.id, p.name)
  return docs.map((a) => {
    const seatId = idOf(a.ownerSeat)
    const seat = seatId !== null ? seats.get(seatId) : undefined
    const owner = seat ? `${seat.title}${seat.holder ? ` (${seat.holder})` : ''}` : (idOf(a.ownerPerson) !== null ? (people.get(idOf(a.ownerPerson) as number) ?? null) : null)
    const status = isActionStatus(a.status) ? a.status : 'open'
    const due = a.due ? day(a.due) : null
    const mid = idOf(a.meeting) ?? 0
    return { id: a.id as number, text: str(a.text), owner, ownerSeatId: seatId, due, dueLabel: due ? dueLabel(due) : null, status, standing: actionStanding({ status, due }, today), meetingId: mid, meetingTitle: titles.get(mid) ?? '', restricted: Boolean(a.effectiveRestricted) }
  })
}

export async function getMeetingPage(user: unknown, id: number): Promise<MeetingPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const meeting = await loadMeeting(payload, user, id)
  if (!meeting) return null
  const bearer = await bearerOf(payload, user)
  const today = currentClubDate()
  const [seatMap, seatList] = await Promise.all([seatNames(payload), loadSeats(payload)])
  const read = { user, overrideAccess: false, pagination: false as const, depth: 0 }
  const where = { meeting: { equals: id } }
  const [itemDocs, motionDocs, actionDocs, attDocs, hidden, peopleDocs, otherOpen, previous] = await Promise.all([
    payload.find({ collection: 'meeting-items', where, sort: 'order', ...read }),
    payload.find({ collection: 'meeting-motions', where, sort: 'id', ...read }),
    payload.find({ collection: 'meeting-actions', where, sort: 'id', ...read }),
    payload.find({ collection: 'meeting-attendance', where, sort: 'id', ...read, depth: 1 }),
    bearer ? Promise.resolve({ totalDocs: 0 }) : payload.count({ collection: 'meeting-items', where: { and: [where, { effectiveRestricted: { equals: true } }] }, overrideAccess: true }),
    peopleNames(),
    payload.find({ collection: 'meeting-actions', where: { and: [{ meeting: { not_equals: id } }, { 'meeting.startsAt': { less_than: str(meeting.startsAt) } }, { status: { in: ['open', 'blocked'] } }] }, sort: 'due', ...read }),
    payload.find({ collection: 'meetings', where: { and: [{ status: { equals: 'closed' } }, { minutesStatus: { equals: 'draft' } }, { startsAt: { less_than: str(meeting.startsAt) } }, { id: { not_equals: id } }] }, sort: '-startsAt', limit: 1, user, overrideAccess: false, depth: 0 }),
  ])
  const titles = new Map<number, string>()
  const otherIds = [...new Set((otherOpen.docs as unknown as Doc[]).map((a) => idOf(a.meeting)).filter((n): n is number => n !== null))]
  if (otherIds.length) for (const m of (await payload.find({ collection: 'meetings', where: { id: { in: otherIds } }, pagination: false, depth: 0, user, overrideAccess: false })).docs as unknown as Doc[]) titles.set(m.id as number, str(m.title))
  const actions = await actionViews(payload, actionDocs.docs as unknown as Doc[], seatMap, today, titles)
  const carried = await actionViews(payload, otherOpen.docs as unknown as Doc[], seatMap, today, titles)
  const motions = (motionDocs.docs as unknown as Doc[]).map((m) => ({ itemId: idOf(m.item), v: { id: m.id as number, text: str(m.text), votesFor: numOrNull(m.votesFor), votesAgainst: numOrNull(m.votesAgainst), abstain: numOrNull(m.abstain), result: (m.result as MotionResult | null) ?? null, restricted: Boolean(m.effectiveRestricted) } }))
  const items: ItemView[] = (itemDocs.docs as unknown as Doc[]).map((i) => ({
    id: i.id as number,
    order: i.order as number,
    title: str(i.title),
    kind: i.kind as ItemKind,
    notes: str(i.notes),
    outcome: str(i.outcome),
    restricted: Boolean(i.restricted),
    motions: motions.filter((m) => m.itemId === i.id).map((m) => m.v),
    actions: actions.filter((_, idx) => idOf((actionDocs.docs as unknown as Doc[])[idx].item) === i.id),
  }))
  const attendance: AttendanceView[] = (attDocs.docs as unknown as Doc[]).map((a) => ({
    id: a.id as number,
    name: a.person && typeof a.person === 'object' ? str((a.person as Doc).name) : str(a.guestName) || 'Guest',
    personId: idOf(a.person),
    guest: !a.person,
    state: (isAttendanceState(a.state) ? a.state : 'present') as AttendanceState,
  }))
  const kind = meeting.kind as MeetingKind
  let logins: { id: number; label: string }[] = []
  if (adminOnly(user) && kind === 'annual') {
    const users = await payload.find({ collection: 'users', where: { and: [{ role: { in: ['admin', 'editor'] } }, { disabled: { not_equals: true } }] }, pagination: false, depth: 0, sort: 'email', overrideAccess: true, select: { email: true, name: true } })
    logins = (users.docs as unknown as Doc[]).map((u) => ({ id: u.id as number, label: str(u.name) ? `${str(u.name)} (${str(u.email)})` : str(u.email) }))
  }
  const settings = resolveOfficeSettings(await payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null))
  const chairSeatId = idOf(meeting.chairSeat)
  const takerSeatId = idOf(meeting.minuteTakerSeat)
  const seatLabel = (sid: number | null) => (sid !== null && seatMap.get(sid) ? `${seatMap.get(sid)!.title}${seatMap.get(sid)!.holder ? ` (${seatMap.get(sid)!.holder})` : ''}` : null)
  const prev = (previous.docs as unknown as Doc[])[0]
  return {
    meeting: { ...toRow(meeting), venue: str(meeting.venue) || null, minutesText: str(meeting.minutesText), minutesStatus: meeting.minutesStatus === 'approved' ? 'approved' : 'draft', chairSeatId, minuteTakerSeatId: takerSeatId, chair: seatLabel(chairSeatId), minuteTaker: seatLabel(takerSeatId), approvedAtMeetingId: idOf(meeting.approvedAtMeeting) },
    items,
    attendance,
    presentCount: attendance.filter((a) => a.state === 'present').length,
    hiddenItems: hidden.totalDocs,
    carried,
    previousMinutes: prev ? { id: prev.id as number, title: str(prev.title) } : null,
    seats: seatList,
    people: peopleDocs,
    bearer,
    isAdmin: adminOnly(user),
    annualName: settings.annualMeetingName,
    logins,
  }
}

/** Minutes for the print page: the saved text, plus (for an office-bearer) the restricted items of an unrestricted meeting. */
export async function getMinutesPage(user: unknown, id: number): Promise<{ title: string; when: string; text: string; annex: string; status: 'draft' | 'approved'; hiddenItems: number; bearer: boolean } | null> {
  const page = await getMeetingPage(user, id)
  if (!page) return null
  const input = await minutesInput(page.meeting.id)
  const annex = page.bearer && !page.meeting.restricted ? buildRestrictedAnnex(input.items) : ''
  return { title: page.meeting.title, when: page.meeting.when, text: page.meeting.minutesText || buildMinutes(input, { includeRestricted: page.bearer && page.meeting.restricted }), annex, status: page.meeting.minutesStatus, hiddenItems: page.hiddenItems, bearer: page.bearer }
}

export type ActionsPage = { actions: ActionView[]; seats: { id: number; title: string }[]; seat: number | null; hiddenNote: boolean; today: string }

export async function getActionsPage(user: unknown, seat: number | null): Promise<ActionsPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const today = currentClubDate()
  const [seatMap, bearer] = await Promise.all([seatNames(payload), bearerOf(payload, user)])
  const and: Record<string, unknown>[] = [{ status: { in: ['open', 'blocked'] } }]
  if (seat) and.push({ ownerSeat: { equals: seat } })
  const docs = (await payload.find({ collection: 'meeting-actions', where: { and } as never, pagination: false, depth: 0, user, overrideAccess: false })).docs as unknown as Doc[]
  const titles = new Map<number, string>()
  const mids = [...new Set(docs.map((a) => idOf(a.meeting)).filter((n): n is number => n !== null))]
  if (mids.length) for (const m of (await payload.find({ collection: 'meetings', where: { id: { in: mids } }, pagination: false, depth: 0, user, overrideAccess: false })).docs as unknown as Doc[]) titles.set(m.id as number, str(m.title))
  const views = await actionViews(payload, docs, seatMap, today, titles)
  const rank: Record<ActionStanding, number> = { overdue: 0, blocked: 1, 'due-soon': 2, open: 3, done: 4, dropped: 5 }
  views.sort((a, b) => rank[a.standing] - rank[b.standing] || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  return { actions: views, seats: [...seatMap.entries()].map(([id, s]) => ({ id, title: s.title })), seat, hiddenNote: !bearer, today }
}

export type MeetingStats = { overdue: number; blocked: number; next: { id: number; title: string; when: string } | null }

/** Counts of open committee actions this caller can see (restricted ones only for an office-bearer) and the next planned meeting. */
export async function meetingStats(user: unknown): Promise<MeetingStats | null> {
  if (!staffOnly(user)) return null
  try {
    const payload = await getPayloadClient()
    const today = currentClubDate()
    const actions = (await payload.find({ collection: 'meeting-actions', where: { status: { in: ['open', 'blocked'] } }, pagination: false, depth: 0, select: { status: true, due: true }, user, overrideAccess: false })).docs as unknown as Doc[]
    let overdue = 0
    let blocked = 0
    for (const a of actions) {
      const s = actionStanding({ status: a.status as ActionStatus, due: a.due ? day(a.due) : null }, today)
      if (s === 'overdue') overdue++
      if (a.status === 'blocked') blocked++
    }
    const next = (await payload.find({ collection: 'meetings', where: { and: [{ status: { in: ['planned', 'in-progress'] } }, { startsAt: { greater_than_equal: `${today}T00:00:00.000Z` } }] }, sort: 'startsAt', limit: 1, depth: 0, user, overrideAccess: false })).docs as unknown as Doc[]
    return { overdue, blocked, next: next[0] ? { id: next[0].id as number, title: str(next[0].title), when: meetingWhen(str(next[0].startsAt)) } : null }
  } catch (err) {
    console.warn('[office] meetings summary unavailable:', (err as Error).message)
    return null
  }
}

export type DocumentRow = { id: number; title: string; category: DocumentCategory; meetingTitle: string | null; filename: string; added: string }
export type DocumentsPage = { documents: DocumentRow[]; isAdmin: boolean; meetings: { id: number; title: string }[]; apiBase: string } | { denied: true }

export async function getDocumentsPage(user: unknown): Promise<DocumentsPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  if (!(await bearerOf(payload, user))) return { denied: true }
  const docs = await payload.find({ collection: 'committee-documents', pagination: false, depth: 1, sort: '-createdAt', user, overrideAccess: false })
  const meetings = await payload.find({ collection: 'meetings', pagination: false, depth: 0, sort: '-startsAt', limit: 50, user, overrideAccess: false, select: { title: true } })
  return {
    documents: (docs.docs as unknown as Doc[]).map((d) => ({ id: d.id as number, title: str(d.title), category: d.category as DocumentCategory, meetingTitle: d.meeting && typeof d.meeting === 'object' ? str((d.meeting as Doc).title) : null, filename: d.file && typeof d.file === 'object' ? str((d.file as Doc).filename) : '', added: day(d.createdAt) })),
    isAdmin: adminOnly(user),
    meetings: (meetings.docs as unknown as Doc[]).map((m) => ({ id: m.id as number, title: str(m.title) })),
    apiBase: payload.config.routes.api,
  }
}

// ---- minutes input ----------------------------------------------------------------------------------------------------------

/** All structured data of a meeting (override: callers filter on `restricted`), shaped for `buildMinutes`. */
async function minutesInput(meetingId: number, req?: Partial<PayloadRequest>): Promise<MinutesInput> {
  const payload = await getPayloadClient()
  const meeting = (await payload.findByID({ collection: 'meetings', id: meetingId, depth: 0, overrideAccess: true, ...(req ? { req: req as PayloadRequest } : {}) })) as unknown as Doc
  const where = { meeting: { equals: meetingId } }
  const [items, motions, actions, att, seats] = await Promise.all([
    payload.find({ collection: 'meeting-items', where, sort: 'order', pagination: false, depth: 0, overrideAccess: true, ...(req ? { req: req as PayloadRequest } : {}) }),
    payload.find({ collection: 'meeting-motions', where, sort: 'id', pagination: false, depth: 0, overrideAccess: true, ...(req ? { req: req as PayloadRequest } : {}) }),
    payload.find({ collection: 'meeting-actions', where, sort: 'id', pagination: false, depth: 0, overrideAccess: true, ...(req ? { req: req as PayloadRequest } : {}) }),
    payload.find({ collection: 'meeting-attendance', where, sort: 'id', pagination: false, depth: 1, overrideAccess: true, ...(req ? { req: req as PayloadRequest } : {}) }),
    seatNames(payload),
  ])
  const actionViewsAll = await actionViews(payload, actions.docs as unknown as Doc[], seats, currentClubDate(), new Map())
  const seatLabel = (v: unknown) => {
    const sid = idOf(v)
    const s = sid !== null ? seats.get(sid) : undefined
    return s ? `${s.title}${s.holder ? ` (${s.holder})` : ''}` : null
  }
  const mItems: MinutesItem[] = (items.docs as unknown as Doc[]).map((i) => ({
    order: i.order as number,
    title: str(i.title),
    notes: str(i.notes) || null,
    outcome: str(i.outcome) || null,
    restricted: Boolean(i.effectiveRestricted),
    motions: (motions.docs as unknown as Doc[]).filter((m) => idOf(m.item) === i.id).map((m) => ({ text: str(m.text), votesFor: numOrNull(m.votesFor), votesAgainst: numOrNull(m.votesAgainst), abstain: numOrNull(m.abstain), result: (m.result as MotionResult | null) ?? null, restricted: Boolean(m.effectiveRestricted) })),
    actions: actionViewsAll.filter((_, idx) => idOf((actions.docs as unknown as Doc[])[idx].item) === i.id).map((a) => ({ text: a.text, owner: a.owner, due: a.dueLabel, restricted: a.restricted })),
  }))
  return {
    title: str(meeting.title),
    when: meetingWhen(str(meeting.startsAt)),
    venue: str(meeting.venue) || null,
    chair: seatLabel(meeting.chairSeat),
    minuteTaker: seatLabel(meeting.minuteTakerSeat),
    attendance: (att.docs as unknown as Doc[]).map((a) => ({ name: a.person && typeof a.person === 'object' ? str((a.person as Doc).name) : str(a.guestName) || 'Guest', state: (isAttendanceState(a.state) ? a.state : 'present') as AttendanceState })),
    items: mItems,
  }
}

// ---- writes -----------------------------------------------------------------------------------------------------------------

export async function addStandardTemplates(user: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const existing = new Set(((await payload.find({ collection: 'meeting-templates', pagination: false, depth: 0, select: { name: true }, overrideAccess: true })).docs as unknown as Doc[]).map((t) => str(t.name)))
  let n = 0
  for (const t of STARTER_TEMPLATES) {
    if (existing.has(t.name)) continue
    await payload.create({ collection: 'meeting-templates', data: { name: t.name, kind: t.kind, items: t.items.map((i) => ({ title: i.title, kind: i.kind, defaultNotes: i.defaultNotes ?? '', restricted: Boolean(i.restricted) })) }, overrideAccess: true, depth: 0 })
    n++
  }
  return done('templates', { n })
}

export async function createMeeting(user: unknown, raw: Parameters<typeof validateNewMeeting>[0]): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const checked = validateNewMeeting(raw)
  if (!checked.ok) return checked
  const payload = await getPayloadClient()
  const template = (await payload.findByID({ collection: 'meeting-templates', id: checked.value.templateId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  if (!template) return fail('template')
  const kind = template.kind as MeetingKind
  const restricted = defaultMeetingRestricted(kind)
  // A restricted meeting is visible to office-bearers only, so only they may create one (others would create what they cannot open).
  if (restricted && !(await bearerOf(payload, user))) return fail('restricted-create')
  const items = itemsFromTemplate({ kind, items: ((template.items as Doc[]) ?? []).map((i) => ({ title: str(i.title), kind: i.kind as ItemKind, defaultNotes: str(i.defaultNotes), restricted: Boolean(i.restricted) })) })
  // Business arising always exists, because the open actions from earlier meetings are reviewed under it.
  if (!items.some((i) => i.kind === 'business')) {
    items.splice(Math.min(2, items.length), 0, { order: 0, title: 'Business arising', kind: 'business', notes: '', restricted: false })
    items.forEach((i, idx) => (i.order = idx + 1))
  }
  const seats = (await payload.find({ collection: 'committee-seats', pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  try {
    const id = await inTransaction(payload, async (req) => {
      const r = req as PayloadRequest
      const m = await payload.create({
        collection: 'meetings',
        data: { title: checked.value.title ?? `${str(template.name)}`, kind, startsAt: checked.value.startsAt, venue: checked.value.venue ?? '', status: 'planned', restricted, minutesStatus: 'draft' },
        overrideAccess: true,
        depth: 0,
        req: r,
      })
      for (const it of items) {
        await payload.create({ collection: 'meeting-items', data: { meeting: m.id, order: it.order, title: it.title, kind: it.kind, notes: it.notes, restricted: it.restricted, effectiveRestricted: effectiveRestricted(restricted, it.restricted) }, overrideAccess: true, depth: 0, req: r })
      }
      for (const s of seats) {
        const person = idOf(s.holder)
        if (person !== null) await payload.create({ collection: 'meeting-attendance', data: { meeting: m.id, person, state: 'present', effectiveRestricted: restricted }, overrideAccess: true, depth: 0, req: r })
      }
      return m.id
    })
    return done('created', { id })
  } catch (err) {
    console.warn('[office] create meeting failed:', (err as Error).message)
    return fail('save')
  }
}

/** Opens a meeting for editing: the caller must be able to see it, and it must not be closed or cancelled unless `allowClosed`. */
async function editable(user: TypedUser, id: number, allowClosed = false): Promise<{ payload: Payload; meeting: Doc } | ActionResult> {
  const payload = await getPayloadClient()
  const meeting = await loadMeeting(payload, user, id)
  if (!meeting) return fail('not-found')
  if (!allowClosed && (meeting.status === 'closed' || meeting.status === 'cancelled')) return fail('closed')
  return { payload, meeting }
}
const isFail = (v: unknown): v is ActionResult => Boolean(v) && typeof v === 'object' && 'ok' in (v as object)

export async function setAttendance(user: unknown, raw: { meetingId: unknown; personId: unknown; state: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  const pid = parseId(raw.personId)
  if (!mid || !pid) return fail('not-found')
  if (!isAttendanceState(raw.state)) return fail('state')
  const e = await editable(user, mid)
  if (isFail(e)) return e
  const { payload, meeting } = e
  if (!(await personExists(pid))) return fail('person')
  const found = await payload.find({ collection: 'meeting-attendance', where: { and: [{ meeting: { equals: mid } }, { person: { equals: pid } }] }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) await payload.update({ collection: 'meeting-attendance', id: found.docs[0].id, data: { state: raw.state }, overrideAccess: true, depth: 0 })
  else await payload.create({ collection: 'meeting-attendance', data: { meeting: mid, person: pid, state: raw.state, effectiveRestricted: Boolean(meeting.restricted) }, overrideAccess: true, depth: 0 })
  return done('attendance', { id: mid })
}

export async function setAttendanceRow(user: unknown, raw: { id: unknown; state: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseId(raw.id)
  if (!id) return fail('not-found')
  if (!isAttendanceState(raw.state)) return fail('state')
  const payload = await getPayloadClient()
  const row = (await payload.findByID({ collection: 'meeting-attendance', id, user, overrideAccess: false, depth: 0 }).catch(() => null)) as unknown as Doc | null
  if (!row) return fail('not-found')
  const e = await editable(user, idOf(row.meeting) ?? 0)
  if (isFail(e)) return e
  await payload.update({ collection: 'meeting-attendance', id, data: { state: raw.state }, overrideAccess: true, depth: 0 })
  return done('attendance', { id: idOf(row.meeting) ?? undefined })
}

export async function addGuest(user: unknown, raw: { meetingId: unknown; name: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const name = validateTitle(raw.name, 80)
  if (!name.ok) return fail('text')
  const e = await editable(user, mid)
  if (isFail(e)) return e
  await e.payload.create({ collection: 'meeting-attendance', data: { meeting: mid, guestName: name.value, state: 'present', effectiveRestricted: Boolean(e.meeting.restricted) }, overrideAccess: true, depth: 0 })
  return done('attendance', { id: mid })
}

async function loadItem(payload: Payload, user: TypedUser, id: number): Promise<Doc | null> {
  return (await payload.findByID({ collection: 'meeting-items', id, user, overrideAccess: false, depth: 0 }).catch(() => null)) as unknown as Doc | null
}

export async function saveItem(user: unknown, raw: { id: unknown; notes: unknown; outcome: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseId(raw.id)
  if (!id) return fail('not-found')
  const notes = validateNote(raw.notes, 8000)
  const outcome = validateNote(raw.outcome, 2000)
  if (!notes.ok || !outcome.ok) return fail('text')
  const payload = await getPayloadClient()
  const item = await loadItem(payload, user, id)
  if (!item) return fail('not-found')
  const e = await editable(user, idOf(item.meeting) ?? 0)
  if (isFail(e)) return e
  await payload.update({ collection: 'meeting-items', id, data: { notes: notes.value, outcome: outcome.value }, overrideAccess: true, depth: 0 })
  return done('item', { id: idOf(item.meeting) ?? undefined })
}

export async function addItem(user: unknown, raw: { meetingId: unknown; title: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const title = validateTitle(raw.title)
  if (!title.ok) return title
  const e = await editable(user, mid)
  if (isFail(e)) return e
  const last = await e.payload.find({ collection: 'meeting-items', where: { meeting: { equals: mid } }, sort: '-order', limit: 1, depth: 0, overrideAccess: true })
  const order = ((last.docs[0] as unknown as Doc | undefined)?.order as number | undefined) ?? 0
  await e.payload.create({ collection: 'meeting-items', data: { meeting: mid, order: order + 1, title: title.value, kind: 'general', restricted: false, effectiveRestricted: Boolean(e.meeting.restricted) }, overrideAccess: true, depth: 0 })
  return done('item-added', { id: mid })
}

/** Office-bearers only: marking something restricted (or lifting it) is a decision about who may read the minutes. */
export async function setItemRestricted(user: unknown, raw: { id: unknown; restricted: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseId(raw.id)
  if (!id) return fail('not-found')
  const payload = await getPayloadClient()
  if (!(await bearerOf(payload, user))) return fail('forbidden')
  const item = await loadItem(payload, user, id)
  if (!item) return fail('not-found')
  const mid = idOf(item.meeting) ?? 0
  const e = await editable(user, mid, true)
  if (isFail(e)) return e
  const value = raw.restricted === 'true' || raw.restricted === true
  await inTransaction(payload, async (req) => {
    await payload.update({ collection: 'meeting-items', id, data: { restricted: value }, overrideAccess: true, depth: 0, req: req as PayloadRequest })
    await resync(payload, mid, req)
    await redraftMinutes(payload, mid, req)
  })
  return done('item', { id: mid })
}

export async function setMeetingRestricted(user: unknown, raw: { meetingId: unknown; restricted: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const payload = await getPayloadClient()
  if (!(await bearerOf(payload, user))) return fail('forbidden')
  const e = await editable(user, mid, true)
  if (isFail(e)) return e
  const value = raw.restricted === 'true' || raw.restricted === true
  await inTransaction(payload, async (req) => {
    await payload.update({ collection: 'meetings', id: mid, data: { restricted: value }, overrideAccess: true, depth: 0, req: req as PayloadRequest })
    await resync(payload, mid, req)
    await redraftMinutes(payload, mid, req)
  })
  return done('status', { id: mid })
}

export async function addMotion(user: unknown, raw: { meetingId: unknown; itemId: unknown; text: unknown; votesFor: unknown; votesAgainst: unknown; abstain: unknown; result: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const checked = validateMotion(raw)
  if (!checked.ok) return checked
  const e = await editable(user, mid)
  if (isFail(e)) return e
  const itemId = raw.itemId === '' || raw.itemId === undefined ? null : parseId(raw.itemId)
  let eff = Boolean(e.meeting.restricted)
  if (itemId) {
    const item = await loadItem(e.payload, user, itemId)
    if (!item || idOf(item.meeting) !== mid) return fail('not-found')
    eff = Boolean(item.effectiveRestricted)
  }
  await e.payload.create({ collection: 'meeting-motions', data: { meeting: mid, item: itemId, ...checked.value, effectiveRestricted: eff }, overrideAccess: true, depth: 0 })
  return done('motion', { id: mid })
}

export async function addAction(user: unknown, raw: { meetingId: unknown; itemId: unknown; text: unknown; ownerSeat: unknown; ownerPerson: unknown; due: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const checked = validateActionInput(raw)
  if (!checked.ok) return checked
  const e = await editable(user, mid)
  if (isFail(e)) return e
  if (checked.value.ownerSeat && !(await e.payload.findByID({ collection: 'committee-seats', id: checked.value.ownerSeat, depth: 0, overrideAccess: true }).catch(() => null))) return fail('seat')
  if (checked.value.ownerPerson && !(await personExists(checked.value.ownerPerson))) return fail('person')
  const itemId = raw.itemId === '' || raw.itemId === undefined ? null : parseId(raw.itemId)
  let eff = Boolean(e.meeting.restricted)
  if (itemId) {
    const item = await loadItem(e.payload, user, itemId)
    if (!item || idOf(item.meeting) !== mid) return fail('not-found')
    eff = Boolean(item.effectiveRestricted)
  }
  await e.payload.create({ collection: 'meeting-actions', data: { meeting: mid, item: itemId, ...checked.value, status: 'open', effectiveRestricted: eff }, overrideAccess: true, depth: 0 })
  return done('action', { id: mid })
}

/** Status changes are allowed at any time, also on a closed meeting: actions get finished long after the meeting. */
export async function setActionStatus(user: unknown, raw: { id: unknown; status: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseId(raw.id)
  if (!id) return fail('not-found')
  if (!isActionStatus(raw.status)) return fail('status')
  const payload = await getPayloadClient()
  const row = (await payload.findByID({ collection: 'meeting-actions', id, user, overrideAccess: false, depth: 0 }).catch(() => null)) as unknown as Doc | null
  if (!row) return fail('not-found')
  await payload.update({ collection: 'meeting-actions', id, data: { status: raw.status, doneOn: raw.status === 'done' ? currentClubDate() : null }, overrideAccess: true, depth: 0 })
  return done('action-updated', { id: idOf(row.meeting) ?? undefined })
}

export async function setMeetingStatus(user: unknown, raw: { meetingId: unknown; status: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  if (raw.status !== 'planned' && raw.status !== 'in-progress' && raw.status !== 'cancelled') return fail('status')
  const e = await editable(user, mid, true)
  if (isFail(e)) return e
  if (e.meeting.status === 'closed') return fail('closed')
  await e.payload.update({ collection: 'meetings', id: mid, data: { status: raw.status }, overrideAccess: true, depth: 0 })
  return done('status', { id: mid })
}

export async function setMeetingRoles(user: unknown, raw: { meetingId: unknown; chairSeat: unknown; minuteTakerSeat: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const e = await editable(user, mid)
  if (isFail(e)) return e
  const seat = async (v: unknown): Promise<number | null | 'bad'> => {
    if (v === '' || v === undefined || v === null) return null
    const sid = parseId(v)
    if (!sid) return 'bad'
    return (await e.payload.findByID({ collection: 'committee-seats', id: sid, depth: 0, overrideAccess: true }).catch(() => null)) ? sid : 'bad'
  }
  const chair = await seat(raw.chairSeat)
  const taker = await seat(raw.minuteTakerSeat)
  if (chair === 'bad' || taker === 'bad') return fail('seat')
  await e.payload.update({ collection: 'meetings', id: mid, data: { chairSeat: chair, minuteTakerSeat: taker }, overrideAccess: true, depth: 0 })
  return done('status', { id: mid })
}

/** Close: builds the draft minutes from the structured data, leaving out restricted items unless the whole meeting is restricted. */
export async function closeMeeting(user: unknown, meetingId: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(meetingId)
  if (!mid) return fail('not-found')
  const e = await editable(user, mid)
  if (isFail(e)) return e
  const input = await minutesInput(mid)
  const text = e.meeting.minutesText && str(e.meeting.minutesText).trim() ? str(e.meeting.minutesText) : buildMinutes(input, { includeRestricted: Boolean(e.meeting.restricted) })
  await e.payload.update({ collection: 'meetings', id: mid, data: { status: 'closed', closedAt: new Date().toISOString(), minutesText: text, minutesStatus: 'draft' }, overrideAccess: true, depth: 0 })
  return done('closed', { id: mid })
}

export async function reopenMeeting(user: unknown, meetingId: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(meetingId)
  if (!mid) return fail('not-found')
  const e = await editable(user, mid, true)
  if (isFail(e)) return e
  if (e.meeting.status !== 'closed') return fail('status')
  if (e.meeting.minutesStatus === 'approved') return fail('status')
  await e.payload.update({ collection: 'meetings', id: mid, data: { status: 'in-progress', closedAt: null }, overrideAccess: true, depth: 0 })
  return done('reopened', { id: mid })
}

export async function saveMinutes(user: unknown, raw: { meetingId: unknown; text: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const text = validateNote(raw.text, 60000)
  if (!text.ok) return text
  const e = await editable(user, mid, true)
  if (isFail(e)) return e
  if (e.meeting.minutesStatus === 'approved') return fail('status')
  await e.payload.update({ collection: 'meetings', id: mid, data: { minutesText: text.value }, overrideAccess: true, depth: 0 })
  return done('minutes', { id: mid })
}

/** The "Approve previous minutes" item: marks an earlier closed meeting's minutes approved at this meeting. */
export async function approveMinutes(user: unknown, raw: { meetingId: unknown; previousId: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  const pid = parseId(raw.previousId)
  if (!mid || !pid || mid === pid) return fail('not-found')
  const e = await editable(user, mid)
  if (isFail(e)) return e
  const prev = await loadMeeting(e.payload, user, pid)
  if (!prev) return fail('not-found')
  if (prev.status !== 'closed' || prev.minutesStatus === 'approved') return fail('status')
  // Only what the page offers: the latest earlier closed meeting whose minutes are still a draft.
  const offered = await e.payload.find({ collection: 'meetings', where: { and: [{ status: { equals: 'closed' } }, { minutesStatus: { equals: 'draft' } }, { startsAt: { less_than: str(e.meeting.startsAt) } }, { id: { not_equals: mid } }] }, sort: '-startsAt', limit: 1, user: user as never, overrideAccess: false, depth: 0 })
  if ((offered.docs as unknown as Doc[])[0]?.id !== pid) return fail('status')
  await e.payload.update({ collection: 'meetings', id: pid, data: { minutesStatus: 'approved', approvedAtMeeting: mid }, overrideAccess: true, depth: 0 })
  return done('approved', { id: mid })
}

// ---- seat handover ----------------------------------------------------------------------------------------------------------

/**
 * Hand over seats at an annual meeting (admin only: it decides who can open restricted minutes and documents). Per changed seat, in one
 * transaction: the new holder and term are written, the old holder's login is cleared unconditionally, and a login is linked only if one
 * was picked. An unchanged seat is untouched. One audit row per changed seat records the seat, the outgoing and incoming person and the date.
 */
export async function handoverSeats(user: unknown, raw: { meetingId: unknown; changes: { seatId: unknown; personId: unknown; loginId: unknown }[] }): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const mid = parseId(raw.meetingId)
  if (!mid) return fail('not-found')
  const payload = await getPayloadClient()
  const meeting = await loadMeeting(payload, user, mid)
  if (!meeting) return fail('not-found')
  if (meeting.kind !== 'annual') return fail('not-annual')
  const seats = await loadSeats(payload)
  const changes: HandoverChange[] = []
  for (const c of raw.changes) {
    const seatId = parseId(c.seatId)
    if (!seatId || !seats.some((s) => s.id === seatId)) return fail('seat')
    const empty = (v: unknown) => v === '' || v === undefined || v === null || v === 'vacant'
    const personId = empty(c.personId) ? null : parseId(c.personId)
    if (!empty(c.personId) && !personId) return fail('person')
    if (personId && !(await personExists(personId))) return fail('person')
    const loginId = empty(c.loginId) ? null : parseId(c.loginId)
    if (!empty(c.loginId)) {
      const login = loginId ? ((await payload.findByID({ collection: 'users', id: loginId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null) : null
      // Only an active admin or editor can hold a seat login; a selector never can.
      if (!login || login.disabled || (login.role !== 'admin' && login.role !== 'editor')) return fail('login')
    }
    const cur = seats.find((x) => x.id === seatId)!
    // A login picked for a seat whose holder is not changing would be dropped silently, so refuse and say why.
    if (loginId && personId === cur.holderId) return fail('login-unchanged')
    changes.push({ seatId, newPersonId: personId, loginUserId: personId ? loginId : null })
  }
  const date = day(meeting.startsAt)
  const ops = planHandover(seats.map((s) => ({ id: s.id, title: s.title, holderPersonId: s.holderId, holderUserId: s.holderUserId })), changes, date)
  if (!ops.length) return done('handover', { n: 0, id: mid })
  try {
    await inTransaction(payload, async (req) => {
      const r = req as PayloadRequest
      for (const op of ops) {
        await payload.update({ collection: 'committee-seats', id: op.seatId, data: { holder: op.set.holder, holderUser: op.set.holderUser, termStart: op.set.termStart ? `${op.set.termStart}T12:00:00.000Z` : null, termEnd: op.set.termEnd ? `${op.set.termEnd}T12:00:00.000Z` : null }, overrideAccess: true, depth: 0, req: r })
        await writeAudit(payload, { userId: user.id as number, action: 'handover', module: 'meetings', summary: sanitiseSummary({ seat: op.seatId, from: op.fromPersonId ?? 0, to: op.toPersonId ?? 0, meeting: mid, date: dateAsNumber(date) }, HANDOVER_SUMMARY), rowCount: 1, includedSensitive: false }, r)
      }
    })
  } catch (err) {
    console.warn('[office] handover failed:', (err as Error).message)
    return fail('save')
  }
  return done('handover', { n: ops.length, id: mid })
}

/** Who can open office-bearer documents right now, for the handover summary: computed from the seats and admins, not typed in. */
export async function currentOfficeBearers(user: unknown): Promise<{ seatHolders: string[]; admins: number } | null> {
  if (!adminOnly(user)) return null
  const payload = await getPayloadClient()
  const seats = await payload.find({ collection: 'committee-seats', where: { officeBearer: { equals: true } }, pagination: false, depth: 2, overrideAccess: true })
  const seatHolders: string[] = []
  for (const s of seats.docs as unknown as Doc[]) {
    const u = s.holderUser && typeof s.holderUser === 'object' ? (s.holderUser as Doc) : null
    if (!u || u.disabled || u.role !== 'editor') continue
    if (s.termEnd && new Date(str(s.termEnd)).getTime() <= Date.now()) continue
    seatHolders.push(`${str(u.name) || str(u.email)} (${str(s.title)})`)
  }
  const admins = await payload.count({ collection: 'users', where: { and: [{ role: { equals: 'admin' } }, { disabled: { not_equals: true } }] }, overrideAccess: true })
  return { seatHolders, admins: admins.totalDocs }
}

// ---- documents --------------------------------------------------------------------------------------------------------------

export async function addDocument(user: unknown, raw: { title: unknown; category: unknown; meetingId: unknown; file: File | null }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  if (!(await bearerOf(payload, user))) return fail('forbidden')
  const checked = validateDocument(raw)
  if (!checked.ok) return checked
  const file = raw.file
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) return fail('file')
  if (file.size > OFFICE_FILE_MAX_BYTES) return fail('file-big')
  if (checked.value.meetingId && !(await loadMeeting(payload, user, checked.value.meetingId))) return fail('not-found')
  let fileId: number | null = null
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const created = await payload.create({ collection: 'office-files', data: {}, file: { data: buffer, mimetype: file.type, name: safeFileName(file.name), size: buffer.length }, user, overrideAccess: false, depth: 0 })
    fileId = created.id as number
    const doc = await payload.create({
      collection: 'committee-documents',
      data: { title: checked.value.title, category: checked.value.category, file: fileId, meeting: checked.value.meetingId, uploadedBy: user.id },
      overrideAccess: true,
      depth: 0,
    })
    return done('document', { id: doc.id as number })
  } catch (err) {
    console.warn('[office] add document failed:', (err as Error).message)
    // Do not leave an orphan file behind.
    if (fileId !== null) await payload.delete({ collection: 'office-files', id: fileId, overrideAccess: true }).catch(() => undefined)
    return fail('file')
  }
}

export async function removeDocument(user: unknown, idRaw: unknown): Promise<ActionResult> {
  if (!adminOnly(user)) return fail('forbidden')
  const id = parseId(idRaw)
  if (!id) return fail('not-found')
  const payload = await getPayloadClient()
  const doc = (await payload.findByID({ collection: 'committee-documents', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  if (!doc) return fail('not-found')
  const fileId = idOf(doc.file)
  await payload.delete({ collection: 'committee-documents', id, overrideAccess: true })
  if (fileId !== null) await payload.delete({ collection: 'office-files', id: fileId, overrideAccess: true }).catch(() => undefined)
  return done('document-removed')
}

export { isIsoDay }
