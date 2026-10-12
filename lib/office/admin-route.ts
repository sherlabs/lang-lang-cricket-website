import 'server-only'
import type { TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { isAdminUser, isSignedIn, isStaffUser } from '@/payload/access'
import { exportOriginOk } from './export-gate'

/**
 * Gate for admin-only office route handlers. The caller is re-derived from the request (these are public POSTs), the origin must be
 * ours, and an editor is refused with the same 403 as a foreign origin. Returns the user or the response to send.
 */
export async function requireOfficeAdmin(request: Request): Promise<{ user: TypedUser } | { response: Response }> {
  const payload = await getPayloadClient()
  if (!exportOriginOk({ origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site'), csrf: payload.config.csrf as string[] })) {
    return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const { user } = await payload.auth({ headers: request.headers })
  if (!isSignedIn(user)) return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isAdminUser(user)) return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user: user as TypedUser }
}

/**
 * Gate for committee-level office route handlers (admin or editor). Same checks as `requireOfficeAdmin`, but an editor passes and a
 * selector, who is signed in but not committee, is refused with the same 403.
 */
export async function requireOfficeStaff(request: Request): Promise<{ user: TypedUser } | { response: Response }> {
  const payload = await getPayloadClient()
  if (!exportOriginOk({ origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site'), csrf: payload.config.csrf as string[] })) {
    return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const { user } = await payload.auth({ headers: request.headers })
  if (!isSignedIn(user)) return { response: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isStaffUser(user)) return { response: Response.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user: user as TypedUser }
}
