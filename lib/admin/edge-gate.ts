import { createHash } from 'node:crypto'
import { jwtVerify } from 'jose'
import { adminReturnPath, queryKeysFor } from './redirect'

/**
 * The admin's cheap front gate (wave G WP-0). `loading.tsx` starts streaming the page before the view runs, which locks the status
 * line at 200, so an in-stream redirect never reaches curl, HEAD checks, crawlers or clients without JavaScript as a real 307. This
 * runs from `proxy.ts` before anything streams: a GET or HEAD for an admin page with no usable sign-in token (no cookie, garbage,
 * tampered, expired, wrong auth scheme) answers a real 307 to the login page, carrying the allowlisted return path. It needs no
 * database. A token that verifies but whose session was revoked server-side still reaches the view, which redirects inside the
 * stream; that is the one case a real status cannot cover without a database read on every admin request.
 */

/** Payload's default cookie prefix (this project does not override it) and JWT auth version. */
export const SESSION_COOKIE_PREFIX = 'payload'
const JWT_AUTH_VERSION = 1

/** Pages a signed-out visitor must be able to open (Payload's own account routes). */
const OPEN_PATHS = ['/login', '/logout', '/forgot', '/reset', '/create-first-user', '/unauthorized', '/verify']

export type EdgeGateArgs = {
  method: string
  pathname: string
  search: string
  cookieHeader: string | null
  secret: string | undefined
  adminRoute?: string
}

/** Payload derives its signing key from the configured secret like this (`payload.secret`). */
const payloadKey = (secret: string): Uint8Array => new TextEncoder().encode(createHash('sha256').update(secret).digest('hex').slice(0, 32))

/** One cookie value from a Cookie header (kept tiny on purpose: the proxy must not import Payload). */
function cookieValue(header: string | null, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) {
      const raw = part.slice(at + 1).trim()
      try { return decodeURIComponent(raw) } catch { return raw }
    }
  }
  return undefined
}

async function hasValidToken(cookieHeader: string | null, secret: string): Promise<boolean> {
  const token = cookieValue(cookieHeader, `${SESSION_COOKIE_PREFIX}-token`)
  if (token === undefined || token === '') return false
  try {
    const { payload, protectedHeader } = await jwtVerify(token, payloadKey(secret))
    if (protectedHeader.authVersion !== JWT_AUTH_VERSION) return false
    const { id, collection, sid } = payload as { id?: unknown; collection?: unknown; sid?: unknown }
    return (typeof id === 'number' || typeof id === 'string') && typeof collection === 'string' && typeof sid === 'string'
  } catch {
    return false
  }
}

/** The login URL to answer with, or null when the request should carry on to the page. */
export async function anonymousAdminRedirect(args: EdgeGateArgs): Promise<string | null> {
  const adminRoute = args.adminRoute ?? '/admin'
  if (args.method !== 'GET' && args.method !== 'HEAD') return null
  if (args.pathname !== adminRoute && !args.pathname.startsWith(`${adminRoute}/`)) return null
  const viewPath = args.pathname.slice(adminRoute.length)
  if (OPEN_PATHS.some((p) => viewPath === p || viewPath.startsWith(`${p}/`))) return null
  if (!args.secret) return null // cannot judge a token: leave it to the page
  if (await hasValidToken(args.cookieHeader, args.secret)) return null

  const keys = queryKeysFor(viewPath)
  const query = Object.fromEntries(new URLSearchParams(args.search))
  const back = viewPath === '' ? adminRoute : adminReturnPath({ adminRoute, viewPath, query, keys })
  return `${adminRoute}/login?redirect=${encodeURIComponent(back)}`
}
