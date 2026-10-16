import { addAction, addDocument, addGuest, addItem, addMotion, addStandardTemplates, approveMinutes, closeMeeting, createMeeting, handoverSeats, removeDocument, reopenMeeting, saveItem, saveMinutes, setActionStatus, setAttendance, setAttendanceRow, setItemRestricted, setMeetingRestricted, setMeetingRoles, setMeetingStatus, type ActionResult } from '@/lib/meetings-office-queries'
import { requireOfficeStaff } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'

/** Where a form came from. Only the meetings pages are allowed, so a crafted `return` cannot send anyone elsewhere. */
const RETURN = /^\/office\/meetings(\/(\d{1,10}|actions|documents))?$/

/**
 * POST (committee): every meetings form. The action is the last path segment; the caller is re-derived from the request, the origin
 * must be ours, the values go through pure validators, and office-bearer and admin checks (restricted items, documents, seat
 * handover) happen inside the queries, never from a form field. The reply is a 303 back with a short code, never text.
 */
export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  const gate = await requireOfficeStaff(request)
  if ('response' in gate) return gate.response
  const { action } = await ctx.params
  const form = await request.formData().catch(() => null)
  const field = (k: string): FormDataEntryValue | null => form?.get(k) ?? null
  const get = (k: string): string => {
    const v = field(k)
    return typeof v === 'string' ? v : ''
  }
  const ret = RETURN.test(get('return')) ? get('return') : '/office/meetings'
  const finish = (r: ActionResult) => (r.ok ? backToOffice(ret, { notice: r.notice, ...(r.n !== undefined ? { n: r.n } : {}) }) : backToOffice(ret, { error: r.code }))
  if (!form) return backToOffice(ret, { error: 'save' })
  const user = gate.user

  switch (action) {
    case 'templates':
      return finish(await addStandardTemplates(user))
    case 'create': {
      const r = await createMeeting(user, { templateId: get('templateId'), date: get('date'), time: get('time'), title: get('title'), venue: get('venue') })
      return r.ok && r.id ? backToOffice(`/office/meetings/${r.id}`, { notice: r.notice }) : finish(r)
    }
    case 'attendance':
      return finish(await setAttendance(user, { meetingId: get('meetingId'), personId: get('personId'), state: get('state') }))
    case 'attendance-row':
      return finish(await setAttendanceRow(user, { id: get('id'), state: get('state') }))
    case 'guest':
      return finish(await addGuest(user, { meetingId: get('meetingId'), name: get('name') }))
    case 'item-save':
      return finish(await saveItem(user, { id: get('id'), notes: get('notes'), outcome: get('outcome') }))
    case 'item-add':
      return finish(await addItem(user, { meetingId: get('meetingId'), title: get('title') }))
    case 'item-restricted':
      return finish(await setItemRestricted(user, { id: get('id'), restricted: get('restricted') }))
    case 'meeting-restricted':
      return finish(await setMeetingRestricted(user, { meetingId: get('meetingId'), restricted: get('restricted') }))
    case 'motion':
      return finish(await addMotion(user, { meetingId: get('meetingId'), itemId: get('itemId'), text: get('text'), votesFor: get('votesFor'), votesAgainst: get('votesAgainst'), abstain: get('abstain'), result: get('result') }))
    case 'action-add':
      return finish(await addAction(user, { meetingId: get('meetingId'), itemId: get('itemId'), text: get('text'), ownerSeat: get('ownerSeat'), ownerPerson: get('ownerPerson'), due: get('due') }))
    case 'action-status':
      return finish(await setActionStatus(user, { id: get('id'), status: get('status') }))
    case 'meeting-status':
      return finish(await setMeetingStatus(user, { meetingId: get('meetingId'), status: get('status') }))
    case 'meeting-roles':
      return finish(await setMeetingRoles(user, { meetingId: get('meetingId'), chairSeat: get('chairSeat'), minuteTakerSeat: get('minuteTakerSeat') }))
    case 'close':
      return finish(await closeMeeting(user, get('meetingId')))
    case 'reopen':
      return finish(await reopenMeeting(user, get('meetingId')))
    case 'minutes-save':
      return finish(await saveMinutes(user, { meetingId: get('meetingId'), text: get('text') }))
    case 'minutes-approve':
      return finish(await approveMinutes(user, { meetingId: get('meetingId'), previousId: get('previousId') }))
    case 'handover': {
      const changes: { seatId: string; personId: string; loginId: string }[] = []
      for (const key of form.keys()) {
        const m = /^seat_(\d{1,10})_person$/.exec(key)
        if (m) changes.push({ seatId: m[1], personId: get(key), loginId: get(`seat_${m[1]}_login`) })
      }
      return finish(await handoverSeats(user, { meetingId: get('meetingId'), changes }))
    }
    case 'document-add': {
      const file = field('file')
      return finish(await addDocument(user, { title: get('title'), category: get('category'), meetingId: get('meetingId'), file: file instanceof File ? file : null }))
    }
    case 'document-remove':
      return finish(await removeDocument(user, get('id')))
    default:
      return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
