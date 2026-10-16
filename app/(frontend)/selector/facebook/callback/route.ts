import { getPayloadClient } from '@/lib/payload/client'
import { handleCallback } from '@/lib/selector-oauth'

export const dynamic = 'force-dynamic'

/** Where Facebook sends the person back. Invite-only; never creates a user. Logic and tests: lib/selector-oauth.ts. */
export async function GET(request: Request) {
  return handleCallback(request, { payload: await getPayloadClient() })
}
