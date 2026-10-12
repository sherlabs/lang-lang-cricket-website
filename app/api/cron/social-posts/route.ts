import { getPayloadClient } from '@/lib/payload/client'
import { configuredNetworks } from '@/lib/social/adapters'
import { cronAuthorized } from '@/lib/social/cron-auth'
import { recordHeartbeat } from '@/lib/social/heartbeat'
import { publishDue } from '@/lib/social/publisher'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * The scheduled-posting run (wave C spec 4.7): `Authorization: Bearer $CRON_SECRET`. An unset secret never matches. After the check it
 * records a heartbeat on every run (so the committee can see when the scheduler last looked), then publishes what is due through the
 * networks that are available. With none available it does nothing at all. The answer lists post ids and statuses only.
 */
export async function GET(request: Request): Promise<Response> {
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('Unauthorized', { status: 401 })
  const payload = await getPayloadClient()
  await recordHeartbeat(payload).catch((err) => console.error('[social] heartbeat failed:', err instanceof Error ? err.message : err))
  const configured = configuredNetworks(process.env)
  if (configured.length === 0) return Response.json({ configured: [], claimed: 0 })
  const summary = await publishDue(payload)
  return Response.json({ configured: configured.map((a) => a.id), claimed: summary.claimed.length, posts: summary.claimed })
}
