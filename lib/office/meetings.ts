import { isAdminUser, isStaffUser } from '../../payload/access'
import { looksLikeCardNumber } from './card'

/**
 * Committee meetings, seats and office-bearer rules (wave D spec section 6). Everything here is pure: the data layer
 * (`lib/meetings-office-queries.ts`) loads rows and calls these, so the rules are unit tested without a database.
 */
export const MEETING_KINDS = ['ordinary', 'annual', 'special'] as const
export type MeetingKind = (typeof MEETING_KINDS)[number]
export const MEETING_STATUSES = ['planned', 'in-progress', 'closed', 'cancelled'] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]
export const MINUTES_STATUSES = ['draft', 'approved'] as const
export const ITEM_KINDS = ['general', 'welcome', 'minutes', 'business', 'report', 'financial', 'election', 'close'] as const
export type ItemKind = (typeof ITEM_KINDS)[number]
export const ATTENDANCE_STATES = ['present', 'apology', 'absent'] as const
export type AttendanceState = (typeof ATTENDANCE_STATES)[number]
export const MOTION_RESULTS = ['carried', 'lost', 'tabled', 'withdrawn'] as const
export type MotionResult = (typeof MOTION_RESULTS)[number]
export const ACTION_STATUSES = ['open', 'done', 'blocked', 'dropped'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]
export const DOCUMENT_CATEGORIES = ['governance', 'finance', 'insurance', 'legal', 'policy', 'other'] as const
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]
/** Server-side upload cap for office-bearer documents: uploads pass through the function body, so it is 4 MB, not 15. */
export const OFFICE_FILE_MAX_BYTES = 4 * 1024 * 1024
export const OFFICE_FILE_TOO_BIG = 'Files over 4 MB are not supported here; share a link instead.'
export const OFFICE_FILE_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]

const oneOf = <T extends string>(list: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
export const isMeetingKind = oneOf(MEETING_KINDS)
export const isMeetingStatus = oneOf(MEETING_STATUSES)
export const isItemKind = oneOf(ITEM_KINDS)
export const isAttendanceState = oneOf(ATTENDANCE_STATES)
export const isMotionResult = oneOf(MOTION_RESULTS)
export const isActionStatus = oneOf(ACTION_STATUSES)
export const isDocumentCategory = oneOf(DOCUMENT_CATEGORIES)

// ---- restriction ------------------------------------------------------------------------------------------------------------

/** A special meeting is restricted unless someone clears it; any meeting can be marked restricted by hand. */
export const defaultMeetingRestricted = (kind: MeetingKind): boolean => kind === 'special'

/** An item is restricted when it was marked so, when it is a finance item, or when its whole meeting is restricted. */
export const effectiveRestricted = (meetingRestricted: boolean, itemRestricted: boolean): boolean => meetingRestricted || itemRestricted

export type TemplateItem = { title: string; kind: ItemKind; defaultNotes?: string | null; restricted?: boolean | null }
export type TemplateInput = { kind: MeetingKind; items: readonly TemplateItem[] }
export type NewItem = { order: number; title: string; kind: ItemKind; notes: string; restricted: boolean }

/** Items for a new meeting from a template: finance items and every item of a special template start restricted. */
export function itemsFromTemplate(template: TemplateInput): NewItem[] {
  return template.items.map((t, i) => ({
    order: i + 1,
    title: t.title,
    kind: t.kind,
    notes: t.defaultNotes ?? '',
    restricted: Boolean(t.restricted) || t.kind === 'financial' || template.kind === 'special',
  }))
}

// ---- office-bearer ----------------------------------------------------------------------------------------------------------

export type SeatTerm = { holderUserId: number | null; officeBearer: boolean; termEnd: string | null }
type UserLike = { id?: unknown; role?: unknown; disabled?: unknown } | null | undefined

/**
 * Who counts as an office-bearer: an active admin, or an active committee user (editor) who holds a seat marked office-bearer
 * whose term has not ended. "Not ended" is exactly `termEnd` empty or later than now. Selectors and disabled users never qualify.
 */
export function decideOfficeBearer(user: UserLike, seats: readonly SeatTerm[], now: Date): boolean {
  if (isAdminUser(user)) return true
  if (!isStaffUser(user) || user?.role !== 'editor' || typeof user.id !== 'number') return false
  return seats.some((s) => s.holderUserId === user.id && s.officeBearer && (s.termEnd === null || new Date(s.termEnd).getTime() > now.getTime()))
}

// ---- handover ---------------------------------------------------------------------------------------------------------------

export type SeatRow = { id: number; title: string; holderPersonId: number | null; holderUserId: number | null }
export type HandoverChange = { seatId: number; newPersonId: number | null; loginUserId: number | null }
export type HandoverOp = {
  seatId: number
  title: string
  fromPersonId: number | null
  toPersonId: number | null
  /** Fields to write on the seat. `holderUser` is cleared on every changed seat and set only when a login was picked. */
  set: { holder: number | null; holderUser: number | null; termStart: string | null; termEnd: string | null }
}

/**
 * Which seats change hands at the annual meeting. A seat whose new holder equals the current one is untouched. Every changed seat
 * loses its login (so an ex-holder loses office-bearer access on the next request) and gets one back only if a login was picked.
 */
export function planHandover(seats: readonly SeatRow[], changes: readonly HandoverChange[], date: string): HandoverOp[] {
  const bySeat = new Map(seats.map((s) => [s.id, s]))
  const ops: HandoverOp[] = []
  const seen = new Set<number>()
  for (const c of changes) {
    const seat = bySeat.get(c.seatId)
    if (!seat || seen.has(c.seatId)) continue
    seen.add(c.seatId)
    // Unchanged unless the person differs, or the seat is vacant but still carries a login (that old login must be cleared).
    const staleLogin = c.newPersonId === null && seat.holderUserId !== null
    if (c.newPersonId === seat.holderPersonId && !staleLogin) continue
    const vacant = c.newPersonId === null
    ops.push({
      seatId: seat.id,
      title: seat.title,
      fromPersonId: seat.holderPersonId,
      toPersonId: c.newPersonId,
      set: {
        holder: c.newPersonId,
        holderUser: vacant ? null : c.loginUserId,
        // A new term starts on the meeting date; a seat left vacant records the end of the old term instead.
        termStart: vacant ? null : date,
        termEnd: vacant ? date : null,
      },
    })
  }
  return ops
}

/** The audit date as a number (yyyymmdd): the audit summary keeps numbers and enumerated words only, never free text. */
export const dateAsNumber = (isoDate: string): number => Number(isoDate.slice(0, 10).replace(/-/g, ''))

// ---- actions ----------------------------------------------------------------------------------------------------------------

export type ActionStanding = 'overdue' | 'due-soon' | 'blocked' | 'open' | 'done' | 'dropped'

/** Derived on read, never stored. Overdue wins over blocked so a late blocked action is still counted as late. */
export function actionStanding(a: { status: ActionStatus; due: string | null }, today: string, soonDays = 7): ActionStanding {
  if (a.status === 'done') return 'done'
  if (a.status === 'dropped') return 'dropped'
  const due = a.due ? a.due.slice(0, 10) : null
  if (due && due < today) return 'overdue'
  if (a.status === 'blocked') return 'blocked'
  if (due) {
    const limit = new Date(`${today}T12:00:00Z`)
    limit.setUTCDate(limit.getUTCDate() + soonDays)
    if (due <= limit.toISOString().slice(0, 10)) return 'due-soon'
  }
  return 'open'
}

// ---- minutes ----------------------------------------------------------------------------------------------------------------

export type MinutesMotion = { text: string; votesFor: number | null; votesAgainst: number | null; abstain: number | null; result: MotionResult | null; restricted: boolean }
export type MinutesAction = { text: string; owner: string | null; due: string | null; restricted: boolean }
export type MinutesItem = { order: number; title: string; notes: string | null; outcome: string | null; restricted: boolean; motions: readonly MinutesMotion[]; actions: readonly MinutesAction[] }
export type MinutesInput = {
  title: string
  /** Already formatted in club time and locale by the caller, so this stays pure. */
  when: string
  venue: string | null
  chair: string | null
  minuteTaker: string | null
  attendance: readonly { name: string; state: AttendanceState }[]
  items: readonly MinutesItem[]
}

const RESULT_TEXT: Record<MotionResult, string> = { carried: 'Carried', lost: 'Lost', tabled: 'Tabled', withdrawn: 'Withdrawn' }
export const restrictedLine = (n: number): string => `${n} restricted ${n === 1 ? 'item is' : 'items are'} not shown.`

function renderItem(item: MinutesItem, includeRestricted: boolean): string[] {
  const out: string[] = [`${item.order}. ${item.title}`]
  if (item.notes?.trim()) out.push(item.notes.trim())
  for (const mo of item.motions) {
    if (mo.restricted && !includeRestricted) continue
    const counts = [mo.votesFor !== null ? `for ${mo.votesFor}` : null, mo.votesAgainst !== null ? `against ${mo.votesAgainst}` : null, mo.abstain !== null ? `abstain ${mo.abstain}` : null].filter(Boolean).join(', ')
    out.push(`Motion: ${mo.text}${counts ? ` (${counts})` : ''}${mo.result ? `. ${RESULT_TEXT[mo.result]}.` : ''}`)
  }
  if (item.outcome?.trim()) out.push(`Outcome: ${item.outcome.trim()}`)
  for (const a of item.actions) {
    if (a.restricted && !includeRestricted) continue
    const bits = [a.owner, a.due ? `due ${a.due}` : null].filter(Boolean).join(', ')
    out.push(`Action: ${a.text}${bits ? ` (${bits})` : ''}`)
  }
  out.push('')
  return out
}

/**
 * A draft of the minutes from the structured data. Restricted items (and their motions and actions) are left out unless
 * `includeRestricted`, with one line saying how many were left out. The result is plain text the minute-taker edits.
 */
export function buildMinutes(m: MinutesInput, opts: { includeRestricted: boolean }): string {
  const out: string[] = [m.title, [m.when, m.venue].filter(Boolean).join(', ')]
  if (m.chair) out.push(`Chair: ${m.chair}`)
  if (m.minuteTaker) out.push(`Minutes: ${m.minuteTaker}`)
  out.push('')
  const names = (s: AttendanceState) => m.attendance.filter((a) => a.state === s).map((a) => a.name)
  const present = names('present')
  out.push(`Present (${present.length}): ${present.join(', ') || 'none recorded'}`)
  const apologies = names('apology')
  if (apologies.length) out.push(`Apologies (${apologies.length}): ${apologies.join(', ')}`)
  const absent = names('absent')
  if (absent.length) out.push(`Absent (${absent.length}): ${absent.join(', ')}`)
  out.push('')
  let hidden = 0
  for (const item of [...m.items].sort((a, b) => a.order - b.order)) {
    if (item.restricted && !opts.includeRestricted) {
      hidden++
      continue
    }
    out.push(...renderItem(item, opts.includeRestricted))
  }
  if (hidden > 0) out.push(restrictedLine(hidden))
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** The restricted items on their own, for the office-bearer's copy of unrestricted minutes. Empty when there are none. */
export function buildRestrictedAnnex(items: readonly MinutesItem[]): string {
  const lines: string[] = []
  for (const item of [...items].sort((a, b) => a.order - b.order)) if (item.restricted) lines.push(...renderItem(item, true))
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// ---- input validation -------------------------------------------------------------------------------------------------------

export type MeetingError =
  | 'forbidden'
  | 'not-found'
  | 'date'
  | 'time'
  | 'title'
  | 'template'
  | 'text'
  | 'count'
  | 'result'
  | 'status'
  | 'state'
  | 'person'
  | 'seat'
  | 'login'
  | 'closed'
  | 'not-annual'
  | 'restricted-create'
  | 'login-unchanged'
  | 'file'
  | 'file-big'
  | 'category'
  | 'save'
export type Check<T> = { ok: true; value: T } | { ok: false; code: MeetingError }

const trim = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const posId = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
  return Number.isInteger(n) && n > 0 && n < 2_000_000_000 ? n : null
}
export const parseId = posId
const isoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00Z`).getTime()) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v
export const isIsoDay = isoDate

/** Free text that must not hold a card number. */
const safeText = (v: unknown, max: number): string | null => {
  const t = trim(v, max)
  return t && !looksLikeCardNumber(t) ? t : null
}

export function validateNewMeeting(raw: { templateId: unknown; date: unknown; time: unknown; title: unknown; venue: unknown }): Check<{ templateId: number; startsAt: string; title: string | null; venue: string | null }> {
  const templateId = posId(raw.templateId)
  if (!templateId) return { ok: false, code: 'template' }
  if (!isoDate(raw.date)) return { ok: false, code: 'date' }
  const time = typeof raw.time === 'string' && raw.time ? raw.time : '19:00'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, code: 'time' }
  const title = typeof raw.title === 'string' && raw.title.trim() ? safeText(raw.title, 120) : null
  if (typeof raw.title === 'string' && raw.title.trim() && !title) return { ok: false, code: 'title' }
  const venue = typeof raw.venue === 'string' && raw.venue.trim() ? safeText(raw.venue, 120) : null
  if (typeof raw.venue === 'string' && raw.venue.trim() && !venue) return { ok: false, code: 'text' }
  // Wall-clock-as-UTC, the same convention as event dates: the day and time shown are the day and time typed.
  return { ok: true, value: { templateId, startsAt: `${raw.date}T${time}:00.000Z`, title, venue } }
}

const count = (v: unknown): number | null | 'bad' => {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n >= 0 && n <= 9999 ? n : 'bad'
}

export function validateMotion(raw: { text: unknown; votesFor: unknown; votesAgainst: unknown; abstain: unknown; result: unknown }): Check<{ text: string; votesFor: number | null; votesAgainst: number | null; abstain: number | null; result: MotionResult | null }> {
  const text = safeText(raw.text, 600)
  if (!text) return { ok: false, code: 'text' }
  const votesFor = count(raw.votesFor)
  const votesAgainst = count(raw.votesAgainst)
  const abstain = count(raw.abstain)
  if (votesFor === 'bad' || votesAgainst === 'bad' || abstain === 'bad') return { ok: false, code: 'count' }
  const result = raw.result === '' || raw.result === undefined || raw.result === null ? null : raw.result
  if (result !== null && !isMotionResult(result)) return { ok: false, code: 'result' }
  return { ok: true, value: { text, votesFor, votesAgainst, abstain, result } }
}

export function validateActionInput(raw: { text: unknown; ownerSeat: unknown; ownerPerson: unknown; due: unknown }): Check<{ text: string; ownerSeat: number | null; ownerPerson: number | null; due: string | null }> {
  const text = safeText(raw.text, 400)
  if (!text) return { ok: false, code: 'text' }
  const empty = (v: unknown) => v === undefined || v === null || v === ''
  const ownerSeat = empty(raw.ownerSeat) ? null : posId(raw.ownerSeat)
  const ownerPerson = empty(raw.ownerPerson) ? null : posId(raw.ownerPerson)
  if ((!empty(raw.ownerSeat) && !ownerSeat) || (!empty(raw.ownerPerson) && !ownerPerson)) return { ok: false, code: 'person' }
  if (!empty(raw.due) && !isoDate(raw.due)) return { ok: false, code: 'date' }
  return { ok: true, value: { text, ownerSeat, ownerPerson, due: empty(raw.due) ? null : (raw.due as string) } }
}

export function validateNote(v: unknown, max = 4000): Check<string> {
  if (typeof v !== 'string') return { ok: false, code: 'text' }
  const t = v.trim()
  if (t.length > max || looksLikeCardNumber(t)) return { ok: false, code: 'text' }
  return { ok: true, value: t }
}

export function validateTitle(v: unknown, max = 160): Check<string> {
  const t = safeText(v, max)
  return t ? { ok: true, value: t } : { ok: false, code: 'title' }
}

export function validateDocument(raw: { title: unknown; category: unknown; meetingId: unknown }): Check<{ title: string; category: DocumentCategory; meetingId: number | null }> {
  const title = safeText(raw.title, 160)
  if (!title) return { ok: false, code: 'title' }
  const category = raw.category === '' || raw.category === undefined ? 'other' : raw.category
  if (!isDocumentCategory(category)) return { ok: false, code: 'category' }
  const empty = raw.meetingId === undefined || raw.meetingId === null || raw.meetingId === ''
  const meetingId = empty ? null : posId(raw.meetingId)
  if (!empty && !meetingId) return { ok: false, code: 'not-found' }
  return { ok: true, value: { title, category, meetingId } }
}

/** A stored file name is never trusted for display or headers: strip anything that is not a plain file-name character. */
export const safeFileName = (name: string): string => name.replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'file'

export const MEETING_ERROR_TEXT: Record<MeetingError, string> = {
  forbidden: 'You are not allowed to do that.',
  'not-found': 'That could not be found. It may have been removed.',
  date: 'Please pick a valid date.',
  time: 'Please enter the time as hours and minutes.',
  title: 'Please give it a title (not too long).',
  template: 'Please pick an agenda to start from. An admin can add the standard agendas on the Meetings page.',
  text: 'That text is empty, too long or does not look right.',
  count: 'Vote counts must be whole numbers, or left empty.',
  result: 'Please pick a result from the list.',
  status: 'That change is not possible right now.',
  state: 'Please pick present, apology or absent.',
  person: 'Please pick a person or seat from the list.',
  seat: 'That seat could not be found.',
  login: 'That login cannot be linked to a seat. Pick an active admin or editor.',
  closed: 'This meeting is closed. Reopen it to change it.',
  'not-annual': 'Seats are handed over from an annual meeting only.',
  'login-unchanged': 'Login not linked: the holder of that seat did not change. Change the holder to link a login. Nothing was saved.',
  'restricted-create': 'That agenda makes a restricted meeting, which only office-bearers can create and see. Ask an office-bearer to create it.',
  file: 'Please choose a PDF, Word, Excel or image file.',
  'file-big': OFFICE_FILE_TOO_BIG,
  category: 'Please pick a category from the list.',
  save: 'That could not be saved. Check the details and try again.',
}

export const MEETING_NOTICE_TEXT = {
  created: 'Meeting created.',
  templates: 'Standard agendas added.',
  attendance: 'Attendance saved.',
  item: 'Agenda item saved.',
  'item-added': 'Agenda item added.',
  motion: 'Motion recorded.',
  action: 'Action recorded.',
  'action-updated': 'Action updated.',
  status: 'Meeting updated.',
  closed: 'Meeting closed. The draft minutes are ready to edit.',
  reopened: 'Meeting reopened.',
  minutes: 'Minutes saved.',
  approved: 'Minutes marked as approved.',
  handover: 'Seats handed over.',
  document: 'Document added.',
  'document-removed': 'Document removed.',
} as const
export type MeetingNotice = keyof typeof MEETING_NOTICE_TEXT
export const isMeetingNotice = (v: unknown): v is MeetingNotice => typeof v === 'string' && v in MEETING_NOTICE_TEXT
export const isMeetingError = (v: unknown): v is MeetingError => typeof v === 'string' && v in MEETING_ERROR_TEXT
