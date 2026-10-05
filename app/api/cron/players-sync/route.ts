import { getPayloadClient } from '@/lib/payload/client'
import { syncPlayers } from '@/lib/players/sync'
import { sweep } from '@/lib/throttle'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Vercel Cron calls this daily (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  const payload = await getPayloadClient()
  // Housekeeping on the one daily cron: forget idle rate-limit rows. A failure here must not fail the sync.
  await sweep(payload).catch(() => undefined)
  const result = await syncPlayers(payload)
  return Response.json(result, { status: result.status === 'error' ? 500 : 200 })
}
