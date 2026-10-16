import { addJob, addObjective, addPillar, addStarterJobs, addStarterPlan, copyRepeatingJobs, saveObjective, setJobOwner, setJobStatus, type ActionResult } from '@/lib/diary-office-queries'
import { isJobFilter } from '@/lib/office/diary'
import { requireOfficeStaff } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'
import { isSeasonName } from '@/lib/office/season'

export const dynamic = 'force-dynamic'

/** Where a form came from. Only the diary and plan pages are allowed, so a crafted `return` cannot send anyone elsewhere. */
const RETURN = /^\/office\/(diary|plan)$/

/**
 * POST (committee): every season diary and plan form. The action is the last path segment; the caller is re-derived from the
 * request, the origin must be ours, and the values go through pure validators. The reply is a 303 back with a short code, never text.
 * The season and filter the person was looking at are carried back only if they are a real season name and a known filter.
 */
export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  const gate = await requireOfficeStaff(request)
  if ('response' in gate) return gate.response
  const { action } = await ctx.params
  const form = await request.formData().catch(() => null)
  const get = (k: string): string => {
    const v = form?.get(k)
    return typeof v === 'string' ? v : ''
  }
  const ret = RETURN.test(get('return')) ? get('return') : '/office/diary'
  const view: Record<string, string> = {}
  const seasonBack = get('season')
  if (seasonBack === 'all' || isSeasonName(seasonBack)) view.season = seasonBack
  if (isJobFilter(get('filter')) && get('filter') !== 'all') view.filter = get('filter')
  const finish = (r: ActionResult) => (r.ok ? backToOffice(ret, { ...view, notice: r.notice, ...(r.n !== undefined ? { n: r.n } : {}) }) : backToOffice(ret, { ...view, error: r.code }))
  if (!form) return backToOffice(ret, { error: 'save' })
  const user = gate.user

  switch (action) {
    case 'job-add':
      return finish(await addJob(user, { title: get('title'), season: get('jobSeason') || get('season'), category: get('category'), due: get('due'), ownerSeat: get('ownerSeat'), objective: get('objective'), budget: get('budget') }))
    case 'job-status':
      return finish(await setJobStatus(user, { id: get('id'), status: get('status'), reason: get('reason') }))
    case 'job-owner':
      return finish(await setJobOwner(user, { id: get('id'), seat: get('ownerSeat') }))
    case 'starter-jobs':
      return finish(await addStarterJobs(user, get('season')))
    case 'copy-jobs':
      return finish(await copyRepeatingJobs(user, get('season')))
    case 'pillar-add':
      return finish(await addPillar(user, { title: get('title'), summary: get('summary') }))
    case 'objective-add':
      return finish(await addObjective(user, { title: get('title'), pillar: get('pillar'), targetDate: get('targetDate'), budget: get('budget'), ownerSeat: get('ownerSeat') }))
    case 'objective-save':
      return finish(await saveObjective(user, { id: get('id'), status: get('status'), progressNote: get('progressNote'), budget: get('budget') }))
    case 'starter-plan':
      return finish(await addStarterPlan(user))
    default:
      return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
