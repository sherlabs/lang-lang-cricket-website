import { addManualHours, addShift, addWeek, assign, confirmWeek, createWeeksForSeason, deleteWeek, removeShift, reopenWeek, rotateVolunteerLink, setAssignmentKind, setAssignmentState, setWeekStatus, unassign, voidHours, type ActionResult } from '@/lib/volunteers-office-queries'
import { requireOfficeStaff } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'
import { isSeasonName } from '@/lib/office/season'

export const dynamic = 'force-dynamic'

/** Where a form came from. Only the volunteer pages are allowed, so a crafted `return` cannot send anyone elsewhere. */
const RETURN = /^\/office\/volunteers(\/week\/\d{1,10}|\/hours)?$/

/**
 * POST (committee): every volunteer form. The action is the last path segment; the caller is re-derived from the request, the origin
 * must be ours, the values go through pure validators, and paid or volunteer, who confirmed and who voided are set on the server.
 * Per-person hours (manual entry, voiding) are admin only inside the queries. The reply is a 303 back with a short code, never text.
 */
export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  const gate = await requireOfficeStaff(request)
  if ('response' in gate) return gate.response
  const { action } = await ctx.params
  const form = await request.formData().catch(() => null)
  const get = (k: string): string => (typeof form?.get(k) === 'string' ? (form!.get(k) as string) : '')
  const ret = RETURN.test(get('return')) ? get('return') : '/office/volunteers'
  const season = isSeasonName(get('season')) ? get('season') : ''
  const keep: Record<string, string> = season && ret === '/office/volunteers' ? { season } : {}
  const finish = (r: ActionResult) => (r.ok ? backToOffice(ret, { ...keep, notice: r.notice, ...(r.n !== undefined ? { n: r.n } : {}) }) : backToOffice(ret, { ...keep, error: r.code }))
  if (!form) return backToOffice(ret, { error: 'save' })
  const user = gate.user
  const id = Number(get('id'))

  switch (action) {
    case 'weeks-create':
      return finish(await createWeeksForSeason(user, get('season')))
    case 'week-add':
      return finish(await addWeek(user, { date: get('date'), label: get('label') }))
    case 'week-status':
      return finish(await setWeekStatus(user, id, get('status')))
    case 'week-delete': {
      const r = await deleteWeek(user, id)
      // A removed week has no page to return to.
      return r.ok ? backToOffice('/office/volunteers', { notice: r.notice }) : backToOffice(ret, { error: r.code })
    }
    case 'shift-add':
      return finish(await addShift(user, { weekId: get('weekId'), shiftTypeKey: get('shiftTypeKey'), hours: get('hours'), slots: get('slots') }))
    case 'shift-remove':
      return finish(await removeShift(user, id))
    case 'assign':
      return finish(await assign(user, { shiftId: get('shiftId'), memberId: get('memberId') }))
    case 'unassign':
      return finish(await unassign(user, id))
    case 'assignment-kind':
      return finish(await setAssignmentKind(user, id, get('kind')))
    case 'assignment-state':
      return finish(await setAssignmentState(user, id, get('state')))
    case 'confirm':
      return finish(await confirmWeek(user, id))
    case 'reopen':
      return finish(await reopenWeek(user, id))
    case 'link-rotate':
      return finish(await rotateVolunteerLink(user, Number(get('memberId'))))
    case 'hours-add':
      return finish(await addManualHours(user, { memberId: get('memberId'), date: get('date'), hours: get('hours'), kind: get('kind'), shiftTypeKey: get('shiftTypeKey'), note: get('note') }))
    case 'hours-void':
      return finish(await voidHours(user, { id: get('id'), reason: get('reason') }))
    default:
      return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
