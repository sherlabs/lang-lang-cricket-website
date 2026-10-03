import { getPayloadClient } from '@/lib/payload/client'
import { requireStaff } from '@/lib/payload/staff-route'
import { syncPlayers } from '@/lib/players/sync'

export const dynamic = 'force-dynamic'
// The sync collects every senior team's scorecards from PlayHQ. Never set on Payload's [...slug].
export const maxDuration = 300

/** POST (staff, same-origin): run the PlayHQ players sync now and return its `SyncResult` (spec §8.2). */
export async function POST(request: Request) {
  const gate = await requireStaff(request)
  if ('response' in gate) return gate.response
  const result = await syncPlayers(await getPayloadClient())
  return Response.json(result)
}
