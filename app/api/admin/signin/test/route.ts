import { getPayloadClient } from '@/lib/payload/client'
import { brokerConfig, testConnection } from '@/lib/signin/broker'
import { recordTest } from '@/lib/signin/state'
import { isAdminUser } from '@/payload/access'

export const dynamic = 'force-dynamic'

/**
 * POST (admin only, same-origin): the "Test connection" button on Site settings > Sign-in. Three read-only calls to the configured
 * broker and nowhere else; the result is stored on the settings (never headers, bodies or env values).
 */
export async function POST(request: Request) {
  const payload = await getPayloadClient()
  const origin = request.headers.get('origin')
  const forbidden = () => Response.json({ error: 'Forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  if (!origin || !payload.config.csrf.includes(origin)) return forbidden()
  const { user } = await payload.auth({ headers: request.headers })
  if (!isAdminUser(user)) return forbidden()
  const cfg = brokerConfig()
  if (!cfg) return Response.json({ ok: false, summary: 'The broker address and club id are not set on the server.', checks: [] }, { headers: { 'Cache-Control': 'no-store' } })
  const result = await testConnection(cfg, payload.config.serverURL)
  await recordTest(payload, result).catch((err) => console.warn(`[signin] could not store the test result: ${(err as Error).message.slice(0, 60)}`))
  return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
