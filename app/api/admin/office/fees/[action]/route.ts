import { addAdjustment, addMembership, addTier, addWaiver, closeSeason, copyTiers, recordPayment, removeMembership, voidCharge, voidPayment, voidWaiver, type ActionResult } from '@/lib/fees-office-queries'
import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { isSeasonName } from '@/lib/office/season'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'

/** Where a form came from. Only the Fees pages are allowed, so a crafted `return` cannot send anyone elsewhere. */
const RETURN = /^\/office\/fees(\/member\/\d{1,10})?$/

/**
 * POST (admin only): every Fees form. The action is the last path segment; the caller is re-derived from the request, the origin
 * must be ours, the values go through pure validators, and who recorded what is set on the server. The reply is a 303 back to the
 * page with a short code, never text.
 */
export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const { action } = await ctx.params
  const form = await request.formData().catch(() => null)
  const get = (k: string): string => (typeof form?.get(k) === 'string' ? (form!.get(k) as string) : '')
  const all = (k: string): string[] => (form?.getAll(k) ?? []).filter((v): v is string => typeof v === 'string')
  const ret = RETURN.test(get('return')) ? get('return') : '/office/fees'
  const season = isSeasonName(get('season')) ? get('season') : ''
  const keep: Record<string, string> = season && ret === '/office/fees' ? { season } : {}
  const done = (r: ActionResult & { added?: number; copied?: number }) =>
    r.ok ? backToOffice(ret, { ...keep, notice: r.notice, ...(r.added !== undefined ? { n: r.added } : {}), ...(r.copied !== undefined ? { n: r.copied } : {}) }) : backToOffice(ret, { ...keep, error: r.code })
  if (!form) return backToOffice(ret, { error: 'save' })
  const user = gate.user

  switch (action) {
    case 'payment':
      return done(await recordPayment(user, { nonce: get('nonce'), memberId: get('memberId'), amount: get('amount'), receivedOn: get('receivedOn'), method: get('method'), reference: get('reference'), note: get('note'), payerId: get('payerId'), target: get('target'), splitIds: all('splitIds'), splitShares: all('splitShares') }))
    case 'payment-void':
      return done(await voidPayment(user, { id: get('id'), reason: get('reason'), wholeGroup: get('wholeGroup') }))
    case 'waiver':
      return done(await addWaiver(user, { memberId: get('memberId'), scope: get('scope'), matchId: get('matchId'), season: get('waiverSeason'), amount: get('amount'), note: get('note') }))
    case 'waiver-void':
      return done(await voidWaiver(user, { id: get('id'), reason: get('reason') }))
    case 'charge-void':
      return done(await voidCharge(user, { id: get('id'), reason: get('reason') }))
    case 'adjustment':
      return done(await addAdjustment(user, { memberId: get('memberId'), season: get('adjustSeason'), amount: get('amount'), note: get('note'), date: get('date') }))
    case 'membership':
      return done(await addMembership(user, { memberIds: all('memberIds'), season: get('season'), tierId: get('tierId'), joinedOn: get('joinedOn') }))
    case 'membership-remove':
      return done(await removeMembership(user, Number(get('id'))))
    case 'tier':
      return done(await addTier(user, { season: get('season'), name: get('name'), kind: get('kind'), upfront: get('upfront'), perMatch: get('perMatch') }))
    case 'tiers-copy':
      return done(await copyTiers(user, get('season')))
    case 'close':
      return done(await closeSeason(user, { season: get('season'), confirm: get('confirm'), closeAnyway: get('closeAnyway') }))
    default:
      return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
