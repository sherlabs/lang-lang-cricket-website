import { getPayloadClient } from '@/lib/payload/client'
import { handleDataCallback } from '@/lib/selector-oauth'

export const dynamic = 'force-dynamic'

/** Meta's "deauthorize" callback (server to server, signed): removes the Facebook link of that person. */
export async function POST(request: Request) {
  return handleDataCallback(request, { payload: await getPayloadClient() }, 'deauthorize')
}
