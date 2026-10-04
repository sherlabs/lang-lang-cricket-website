import { getPayloadClient } from '@/lib/payload/client'
import { handleDataCallback } from '@/lib/selector-oauth'

export const dynamic = 'force-dynamic'

/** Meta's "user data deletion" callback (server to server, signed). Paste its URL into the Meta console. */
export async function POST(request: Request) {
  return handleDataCallback(request, { payload: await getPayloadClient() }, 'deletion')
}
