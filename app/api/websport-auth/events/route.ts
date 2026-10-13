import { getPayloadClient } from '@/lib/payload/client'
import { handleBrokerEvent } from '@/lib/selector-oauth'

export const dynamic = 'force-dynamic'

/** Signed events from the shared sign-in broker (data deletion, deauthorize). Server to server; logic and tests: lib/selector-oauth.ts. */
export async function POST(request: Request) {
  return handleBrokerEvent(request, { payload: await getPayloadClient() })
}
