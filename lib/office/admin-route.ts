import 'server-only'
import type { TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { isAdminUser, isSignedIn, isStaffUser } from '@/payload/access'
import { exportOriginOk } from './export-gate'
import { refererInAdmin } from './referer'

type Refusal = 'unauthorized' | 'forbidden'

/**
 * The reply for a refused office POST. These are plain HTML form posts, so a person gets a page, never a bare JSON body: signed out
 * (the session ran out while the form sat open) goes to the admin sign-in and comes back to the page they were on; anything else goes
 * back to that page with a flash code. Only a caller that asks for JSON gets JSON.
 */
export async function refusal(request: Request, kind: Refusal): Promise<Response> {
  if ((request.headers.get('accept') ?? '').includes('application/json')) {
    return kind === 'unauthorized' ? Response.json({ error: 'Unauthorized' }, { status: 401 }) : Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const payload = await getPayloadClient()
  const admin = payload.config.routes.admin
  const back = refererInAdmin(request.headers.get('referer'), request.headers.get('host') ?? new URL(request.url).host, admin)
  const headers = { 'Cache-Control': 'no-store' }
  if (kind === 'unauthorized') {
    const q = back ? `?redirect=${encodeURIComponent(back)}` : ''
    return new Response(null, { status: 303, headers: { ...headers, Location: `${admin}/login${q}` } })
  }
  const target = new URL(back ?? admin, 'http://local.invalid')
  target.searchParams.set('error', 'forbidden')
  return new Response(null, { status: 303, headers: { ...headers, Location: `${target.pathname}${target.search}` } })
}

async function gate(request: Request, allowed: (user: Parameters<typeof isAdminUser>[0]) => boolean): Promise<{ user: TypedUser } | { response: Response }> {
  const payload = await getPayloadClient()
  if (!exportOriginOk({ origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site'), csrf: payload.config.csrf as string[] })) {
    return { response: await refusal(request, 'forbidden') }
  }
  const { user } = await payload.auth({ headers: request.headers })
  if (!isSignedIn(user)) return { response: await refusal(request, 'unauthorized') }
  if (!allowed(user)) return { response: await refusal(request, 'forbidden') }
  return { user: user as TypedUser }
}

/**
 * Gate for admin-only office route handlers. The caller is re-derived from the request (these are public POSTs), the origin must be
 * ours, and an editor is refused like a foreign origin. Returns the user or the response to send.
 */
export function requireOfficeAdmin(request: Request): Promise<{ user: TypedUser } | { response: Response }> {
  return gate(request, isAdminUser)
}

/**
 * Gate for committee-level office route handlers (admin or editor). Same checks as `requireOfficeAdmin`, but an editor passes and a
 * selector, who is signed in but not committee, is refused the same way.
 */
export function requireOfficeStaff(request: Request): Promise<{ user: TypedUser } | { response: Response }> {
  return gate(request, isStaffUser)
}
