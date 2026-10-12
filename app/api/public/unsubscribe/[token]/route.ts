import { clientIp } from '@/lib/client-ip'
import { resolveUnsub, unsubscribe } from '@/lib/email/unsubscribe'
import { getPayloadClient } from '@/lib/payload/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' }

/**
 * POST: the one-click unsubscribe a mail program sends (RFC 8058, `List-Unsubscribe=One-Click`). The signed token is the whole
 * authority (and it keeps working if sending is later switched off), so there is no sign-in, no origin check and no rate limit for a valid token. A token that does not check is a plain 404.
 */
export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params
  const payload = await getPayloadClient()
  const target = await resolveUnsub(payload, token, clientIp(request.headers))
  if (!target) return new Response('Not found', { status: 404, headers })
  await unsubscribe(payload, target)
  return new Response('Unsubscribed', { status: 200, headers })
}
