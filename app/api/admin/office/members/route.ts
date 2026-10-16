import { addMember } from '@/lib/members-queries'
import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'

/** POST (admin only): the quick-add form. Name, roles, email and phone; everything else is set on the server. */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const form = await request.formData().catch(() => null)
  if (!form) return backToOffice('/office/members', { error: 'save' })
  const out = await addMember(gate.user, {
    firstName: form.get('firstName'),
    lastName: form.get('lastName'),
    roles: form.getAll('roles'),
    email: form.get('email'),
    phone: form.get('phone'),
  })
  return out.ok ? backToOffice('/office/members', { notice: 'added' }) : backToOffice('/office/members', { error: out.code })
}
