import { getPayloadClient } from '@/lib/payload/client'
import { handleBrokerCallback } from '@/lib/selector-oauth'

export const dynamic = 'force-dynamic'

/** Where the shared sign-in broker sends the person back. Invite-only; never creates a user. Logic and tests: lib/selector-oauth.ts. */
export async function GET(request: Request) {
  return handleBrokerCallback(request, { payload: await getPayloadClient() })
}
