import { getPayloadClient } from '@/lib/payload/client'
import { handleStart } from '@/lib/selector-oauth'

export const dynamic = 'force-dynamic'

/** Starts Facebook sign-in (404 unless the club's Meta app is configured). Logic and tests: lib/selector-oauth.ts. */
export async function GET(request: Request) {
  return handleStart(request, { payload: await getPayloadClient() })
}
