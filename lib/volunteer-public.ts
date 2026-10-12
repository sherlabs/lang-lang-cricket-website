import type { Payload } from 'payload'
import { claimedMemberId, volunteerTokenMatches } from '@/lib/volunteer-link'
import { displayNameFor } from '@/lib/office/members'
import { resolveOfficeSettings } from '@/lib/office/settings'
import { AVAILABILITY_NOTE_MAX, isActiveState, parseAvailability, type AvailabilityError, type AvailabilityState, type AssignmentState } from '@/lib/office/volunteers'

/**
 * The public side of a volunteer's personal link (wave D spec 5.3). Reached with no login: the token proves the caller was given
 * this person's link. Everything here is about that one person: their first name, the open weeks, their own answers and their own
 * shifts. It never returns another person's name, answer or contact detail. Queries state their own filters because the Local API
 * ignores access rules.
 */
type Doc = Record<string, unknown>
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')

export type Volunteer = { id: number; firstName: string }

/** The volunteer a live token names, or null for anything else (wrong, rotated, past member, removed): the page is then a plain 404. */
export async function resolveVolunteer(payload: Payload, token: string): Promise<Volunteer | null> {
  const id = claimedMemberId(token)
  if (id === null) return null
  const doc = (await payload
    .findByID({ collection: 'members', id, depth: 1, overrideAccess: true, select: { firstName: true, lastName: true, preferredName: true, status: true, erasedAt: true, volunteerLinkVersion: true, player: true, person: true } })
    .catch(() => null)) as unknown as Doc | null
  if (!doc || doc.status === 'past' || doc.erasedAt) return null
  if (!volunteerTokenMatches(token, id, typeof doc.volunteerLinkVersion === 'number' ? doc.volunteerLinkVersion : 0)) return null
  const full = displayNameFor({ ...(doc as object), player: doc.player && typeof doc.player === 'object' ? (doc.player as never) : null, person: doc.person && typeof doc.person === 'object' ? (doc.person as never) : null } as never)
  return { id, firstName: full.split(/\s+/)[0] || 'there' }
}

export type VolunteerWeekView = { id: number; date: string; label: string | null; answer: AvailabilityState | null; note: string; preferred: string[] }
export type MyShift = { weekId: number; date: string; job: string; hours: number; state: AssignmentState }
export type VolunteerView = { weeks: VolunteerWeekView[]; shifts: MyShift[]; jobs: { key: string; label: string }[]; noteMax: number }

/** What the page shows: open weeks that have not happened, this person's answers, and their own rostered or confirmed shifts. */
export async function volunteerView(payload: Payload, memberId: number, today: string): Promise<VolunteerView> {
  const settings = resolveOfficeSettings(await payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null))
  const todayStart = `${today}T00:00:00.000Z`
  const open = (await payload.find({ collection: 'volunteer-weeks', where: { and: [{ status: { equals: 'open' } }, { date: { greater_than_equal: todayStart } }] }, sort: 'date', limit: 12, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const mine = open.length ? (await payload.find({ collection: 'volunteer-availability', where: { and: [{ member: { equals: memberId } }, { week: { in: open.map((w) => w.id as number) } }] }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[] : []
  const byWeek = new Map(mine.map((a) => [idOf(a.week), a]))
  const weeks: VolunteerWeekView[] = open.map((w) => {
    const a = byWeek.get(w.id as number)
    return { id: w.id as number, date: day(w.date), label: typeof w.label === 'string' ? w.label : null, answer: (a?.state as AvailabilityState | undefined) ?? null, note: typeof a?.note === 'string' ? a.note : '', preferred: Array.isArray(a?.preferredShiftKeys) ? (a!.preferredShiftKeys as string[]) : [] }
  })

  // Their own shifts only: the assignment rows for this member, then the shift and week each belongs to.
  const own = (await payload.find({ collection: 'volunteer-assignments', where: { and: [{ member: { equals: memberId } }, { state: { in: ['rostered', 'confirmed'] } }] }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[]
  const shiftIds = own.map((a) => idOf(a.shift)).filter((n): n is number => n !== null)
  const shiftDocs = shiftIds.length ? (await payload.find({ collection: 'volunteer-shifts', where: { id: { in: shiftIds } }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[] : []
  const weekIds = [...new Set(shiftDocs.map((s) => idOf(s.week)).filter((n): n is number => n !== null))]
  const weekDocs = weekIds.length ? (await payload.find({ collection: 'volunteer-weeks', where: { and: [{ id: { in: weekIds } }, { date: { greater_than_equal: todayStart } }, { status: { in: ['open', 'confirmed'] } }] }, pagination: false, depth: 0, overrideAccess: true })).docs as unknown as Doc[] : []
  const weekById = new Map(weekDocs.map((w) => [w.id as number, w]))
  const shiftById = new Map(shiftDocs.map((s) => [s.id as number, s]))
  const shifts: MyShift[] = []
  for (const a of own) {
    const s = shiftById.get(idOf(a.shift) ?? 0)
    const w = s ? weekById.get(idOf(s.week) ?? 0) : undefined
    if (!s || !w || !isActiveState(a.state as AssignmentState)) continue
    shifts.push({ weekId: w.id as number, date: day(w.date), job: String(s.labelSnapshot ?? ''), hours: Number(a.hours) || 0, state: a.state as AssignmentState })
  }
  shifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { weeks, shifts, jobs: settings.shiftTypes.map((t) => ({ key: t.key, label: t.label })), noteMax: AVAILABILITY_NOTE_MAX }
}

export type AnswerCode = 'saved' | 'closed' | AvailabilityError | 'save'
export const ANSWER_TEXT: Record<AnswerCode, string> = {
  saved: 'Thanks, your answer is saved.',
  closed: 'That week is not open for answers any more.',
  state: 'Please tap Yes, Maybe or No.',
  note: 'That note is too long or does not look right.',
  shifts: 'Please pick jobs from the list.',
  save: 'That could not be saved. Please try again.',
}

/** Saves this person's answer for one open week. The person is whoever the token names, never anything in the form. */
export async function answerWeek(payload: Payload, memberId: number, today: string, input: { weekId: unknown; state: unknown; note: unknown; preferred: unknown }): Promise<AnswerCode> {
  const settings = resolveOfficeSettings(await payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null))
  const parsed = parseAvailability({ state: input.state, note: input.note, preferred: input.preferred }, settings.shiftTypes.map((t) => t.key))
  if (!parsed.ok) return parsed.error
  const weekId = Number(input.weekId)
  if (!Number.isInteger(weekId) || weekId < 1) return 'closed'
  const week = (await payload.findByID({ collection: 'volunteer-weeks', id: weekId, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as Doc | null
  if (!week || week.status !== 'open' || day(week.date) < today) return 'closed'
  const data = { member: memberId, week: weekId, state: parsed.state, note: parsed.note, preferredShiftKeys: parsed.preferred }
  try {
    const found = await payload.find({ collection: 'volunteer-availability', where: { and: [{ member: { equals: memberId } }, { week: { equals: weekId } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (found.docs[0]) await payload.update({ collection: 'volunteer-availability', id: found.docs[0].id, data: data as never, overrideAccess: true, depth: 0 })
    else await payload.create({ collection: 'volunteer-availability', data: data as never, overrideAccess: true, depth: 0 })
  } catch (err) {
    console.error('[volunteer] answer failed:', (err as Error).message)
    return 'save'
  }
  return 'saved'
}
