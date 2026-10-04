import 'server-only'
import type { TypedUser } from 'payload'
import { getPayloadClient } from './client'

/**
 * Staff gate for custom admin route handlers (spec §6): a Payload session (cookie or JWT
 * header) plus — for POSTs — an `Origin` that is in `config.csrf`. `payload.auth` already
 * drops a cookie sent from a foreign Origin, but only because `csrf` is non-empty; the
 * explicit check keeps holding if that config ever regresses.
 */
export async function requireStaff(request: Request): Promise<{ user: TypedUser } | { response: Response }> {
  const payload = await getPayloadClient()
  const forbidden = { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  const mutating = request.method !== 'GET' && request.method !== 'HEAD'
  const origin = request.headers.get('origin')
  // A foreign Origin is refused outright; a missing one is checked after authentication so an anonymous
  // caller gets 401 (not signed in) rather than 403.
  if (mutating && origin && !payload.config.csrf.includes(origin)) return forbidden
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (mutating && !origin) return forbidden
  return { user }
}
