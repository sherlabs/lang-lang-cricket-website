import { linkPlayersAsMembers } from '@/lib/members-queries'
import { requireOfficeAdmin } from '@/lib/office/admin-route'
import { backToOffice } from '@/lib/office/redirect'

export const dynamic = 'force-dynamic'

/** POST (admin only): add a contact-free member for every player who has none. Audited as a bulk change. */
export async function POST(request: Request): Promise<Response> {
  const gate = await requireOfficeAdmin(request)
  if ('response' in gate) return gate.response
  const out = await linkPlayersAsMembers(gate.user)
  return out ? backToOffice('/office/members', { notice: 'linked', created: out.created }) : backToOffice('/office/members', { error: 'forbidden' })
}
