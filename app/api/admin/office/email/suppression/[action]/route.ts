import { addManualSuppression, removeSuppression } from '@/lib/email-office-queries'
import { emailEnabled } from '@/lib/email/env'
import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'

/** POST (admin, only while email is on): add an address to the do-not-email list (`add`) or take one off (`remove`). Both are logged. */
export async function POST(request: Request, ctx: { params: Promise<{ action: string }> }): Promise<Response> {
  if (!emailEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const { action } = await ctx.params
  const form = await request.formData().catch(() => null)
  if (action === 'add') {
    const r = await addManualSuppression(gate.user, form?.get('email'))
    return backToOffice('/office/email', r.ok ? { notice: r.notice } : { error: r.code })
  }
  if (action === 'remove') {
    const r = await removeSuppression(gate.user, form?.get('id'))
    return backToOffice('/office/email', r.ok ? { notice: r.notice } : { error: r.code })
  }
  return Response.json({ error: 'Not found' }, { status: 404 })
}
