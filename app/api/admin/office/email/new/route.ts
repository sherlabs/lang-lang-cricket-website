import { createCampaign } from '@/lib/email-office-queries'
import { emailEnabled } from '@/lib/email/env'
import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'

/** POST (admin, only while email is on): start a new email as a draft. Answers 404 when email is off, before any other check. */
export async function POST(request: Request): Promise<Response> {
  if (!emailEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const form = await request.formData().catch(() => null)
  if (!form) return backToOffice('/office/email', { error: 'save' })
  const result = await createCampaign(gate.user, { subject: form.get('subject'), body: form.get('body'), status: form.get('status'), role: form.get('role'), juniors: form.get('juniors'), segment: form.get('segment') })
  if (!result.ok) return backToOffice('/office/email', { error: result.code })
  return backToOffice(`/office/email/${result.id}`, { notice: result.notice })
}
