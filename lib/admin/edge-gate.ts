import { createHash } from 'node:crypto'
import { jwtVerify } from 'jose'
import { SESSION_COOKIE_PREFIX } from './cookie-prefix'
import { adminReturnPath, queryKeysFor } from './redirect'

export { SESSION_COOKIE_PREFIX }

/**
 * The admin's cheap front gate (wave G WP-0). `loading.tsx` starts streaming the page before the view runs, which locks the status
 * line at 200, so an in-stream redirect never reaches curl, HEAD checks, crawlers or clients without JavaScript as a real 307. This
 * runs from `proxy.ts` before anything streams: a GET or HEAD for an admin page with no usable sign-in token (no cookie, garbage,
 * tampered, expired, wrong auth scheme) answers a real 307 to the login page, carrying the allowlisted return path. It needs no
 * database. A token that verifies but whose session was revoked server-side still reaches the view, which redirects inside the
 * stream; that is the one case a real status cannot cover without a database read on every admin request.
 */

/** Payload's JWT auth version. The cookie prefix is shared with `payload.config.ts` (`./cookie-prefix`). */
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

export type ReentryArgs = Omit<EdgeGateArgs, 'search'> & { search: string; secFetchSite: string | null; secFetchMode: string | null }

const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * A signed-in person who opens an admin link from another site (an email, Facebook, a chat app) arrives with
 * `Sec-Fetch-Site: cross-site`. Payload's CSRF rule then ignores the sign-in cookie, so the page sees nobody, redirects to the login
 * page, and the login page (now same-origin) sends them back: a blank bounce, and the link's place can be lost on the way. For a
 * top-level GET of an admin page with a valid token, this answers a tiny page that reopens the same address from this origin, so
 * Payload sees a same-origin request and accepts the cookie. Nothing is spoofed and no unsafe method is touched; the token is still
 * checked by Payload as usual. Returns the HTML to send, or null to carry on.
 */
export async function crossSiteReentryPage(args: ReentryArgs): Promise<string | null> {
  const adminRoute = args.adminRoute ?? '/admin'
  if (args.method !== 'GET' || args.secFetchSite !== 'cross-site' || args.secFetchMode !== 'navigate') return null
  if (args.pathname !== adminRoute && !args.pathname.startsWith(`${adminRoute}/`)) return null
  const viewPath = args.pathname.slice(adminRoute.length)
  if (OPEN_PATHS.some((p) => viewPath === p || viewPath.startsWith(`${p}/`))) return null
  if (!args.secret || !(await hasValidToken(args.cookieHeader, args.secret))) return null
  const href = escapeAttr(`${args.pathname}${args.search}`)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${href}"><title>Opening the admin</title></head><body style="font-family:system-ui,sans-serif;padding:2rem"><p><a href="${href}">Opening the admin…</a></p></body></html>`
}
