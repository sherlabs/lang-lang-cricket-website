import { addItem, issueStock, markLost, postStocktake, receiveStock, removeStock, returnStock, voidMovement, type ActionResult } from '@/lib/stock-office-queries'
import { requireOfficeStaff } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'
import { cleanNonce, parseStocktake } from '@/lib/office/stock'

export const dynamic = 'force-dynamic'

/** Where a form came from. Only the stock pages are allowed, so a crafted `return` cannot send anyone elsewhere. */
const RETURN = /^\/office\/stock(\/(item|people)\/\d{1,10}|\/stocktake)?$/

/**
 * POST (committee): every stock form. The action is the last path segment; the caller is re-derived from the request, the origin must
 * be ours, and the values go through pure validators. The reply is a 303 back with a short code, never text. Who recorded a change,
 * the item's expected-back flag and the stock figures are all worked out on the server, never taken from the form.
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
  const ret = RETURN.test(get('return')) ? get('return') : '/office/stock'
  const tab: Record<string, string> = get('tab') === 'owed' ? { tab: 'owed' } : {}
  const finish = (r: ActionResult) => (r.ok ? backToOffice(ret, { ...tab, notice: r.notice, ...(r.n !== undefined ? { n: r.n } : {}) }) : backToOffice(ret, { ...tab, error: r.code }))
  if (!form) return backToOffice(ret, { error: 'save' })
  const user = gate.user
  const nonce = cleanNonce(get('nonce'))

  switch (action) {
    case 'item-add':
      return finish(await addItem(user, { name: get('name'), groupName: get('groupName'), size: get('size'), category: get('category'), unit: get('unit'), reorderLevel: get('reorderLevel'), location: get('location'), returnable: get('returnable') || undefined }))
    case 'receive':
      return finish(await receiveStock(user, { item: get('item'), qty: get('qty'), date: get('date'), note: get('note'), nonce }))
    case 'issue':
      return finish(await issueStock(user, { item: get('item'), member: get('member'), qty: get('qty'), issuedOn: get('issuedOn'), dueBackOn: get('dueBackOn'), note: get('note'), anyway: get('anyway'), nonce }))
    case 'return':
      return finish(await returnStock(user, { issue: get('issue'), qty: get('qty'), note: get('note'), nonce }))
    case 'lost':
      return finish(await markLost(user, { issue: get('issue'), qty: get('qty'), note: get('note'), nonce }))
    case 'remove':
      return finish(await removeStock(user, { item: get('item'), qty: get('qty'), kind: get('kind'), note: get('note'), nonce }))
    case 'void':
      return finish(await voidMovement(user, { id: get('id'), reason: get('reason') }))
    case 'stocktake': {
      const counts = parseStocktake(form)
      if (!counts.ok) return backToOffice('/office/stock/stocktake', { error: counts.code })
      const r = await postStocktake(user, { counts: counts.value, nonce })
      return r.ok ? backToOffice('/office/stock/stocktake', { notice: r.notice, ...(r.n !== undefined ? { n: r.n } : {}) }) : backToOffice('/office/stock/stocktake', { error: r.code })
    }
    default:
      return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
