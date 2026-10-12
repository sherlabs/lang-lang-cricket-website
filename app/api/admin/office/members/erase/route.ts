import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { eraseMemberDetails } from '@/lib/office/erase'
import { backToOffice } from '@/lib/office/redirect'
import { getPayloadClient } from '@/lib/payload/client'

export const dynamic = 'force-dynamic'

/** POST (admin only): remove a member's personal details. Needs the explicit confirm tick; audited. */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const form = await request.formData().catch(() => null)
  const id = Number(form?.get('id'))
  if (!form || form.get('confirm') !== 'yes' || !Number.isInteger(id) || id < 1) return backToOffice('/office/members', { error: 'bad-id' })
  const payload = await getPayloadClient()
  const out = await eraseMemberDetails(payload, gate.user, id)
  return out.ok ? backToOffice('/office/members', { notice: 'erased' }) : backToOffice('/office/members', { error: out.error === 'forbidden' ? 'forbidden' : out.error === 'not-found' ? 'bad-id' : 'save' })
}
