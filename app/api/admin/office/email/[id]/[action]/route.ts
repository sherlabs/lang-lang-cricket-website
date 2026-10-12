import { parseCampaignId, runBatchForAdmin, saveCampaign, sendTestCopy, startSend, stopSend } from '@/lib/email-office-queries'
import { emailEnabled } from '@/lib/email/env'
import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST (admin, only while email is on): everything done to one email. The action is the last path segment: `save`, `test`, `send`,
 * `stop`, `continue` (one batch, then back to the page) and `batch` (one batch, JSON, for the progress bar). The caller is re-derived
 * from the request, the origin must be ours, and the query layer checks admin again. Answers 404 when email is off, before any other check.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  if (!emailEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const { id, action } = await ctx.params
  const campaignId = parseCampaignId(id)
  if (campaignId === null) return Response.json({ error: 'Not found' }, { status: 404 })
  const back = `/office/email/${campaignId}`

  if (action === 'batch') {
    const result = await runBatchForAdmin(gate.user, campaignId)
    return Response.json(result ? { ok: true, ...result } : { ok: false }, { status: result ? 200 : 404, headers: { 'Cache-Control': 'no-store' } })
  }
  const form = await request.formData().catch(() => null)
  const get = (k: string): FormDataEntryValue | null => form?.get(k) ?? null
  switch (action) {
    case 'save': {
      const r = await saveCampaign(gate.user, campaignId, { subject: get('subject'), body: get('body'), status: get('status'), role: get('role'), juniors: get('juniors'), segment: get('segment') })
      return backToOffice(back, r.ok ? { notice: r.notice } : { error: r.code })
    }
    case 'test': {
      const r = await sendTestCopy(gate.user, campaignId)
      return backToOffice(back, r.ok ? { notice: r.notice } : { error: r.code })
    }
    case 'send': {
      const r = await startSend(gate.user, campaignId, get('expected'))
      return backToOffice(back, r.ok ? { notice: r.notice } : { error: r.code })
    }
    case 'stop': {
      const r = await stopSend(gate.user, campaignId)
      return backToOffice(back, r.ok ? { notice: r.notice } : { error: r.code })
    }
    case 'continue':
      await runBatchForAdmin(gate.user, campaignId)
      return backToOffice(back, {})
    default:
      return Response.json({ error: 'Not found' }, { status: 404 })
  }
}
