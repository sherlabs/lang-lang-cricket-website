import { jwtVerify } from 'jose'
import { parseCookies, type Payload } from 'payload'

/**
 * A second, observable look at a sign-in (wave G WP-0).
 *
 * Payload resolves `req.user` through `executeAuthStrategies`, which catches any error from the session lookup and answers
 * `user: null` after logging it, so "the lookup threw" and "nobody is signed in" look the same to a view. When Payload answered null
 * but a sign-in cookie is present, the admin gate calls this once: it verifies the token itself (no database), then reads the user
 * directly inside its own try/catch, so a thrown or timed-out lookup is an `error` and not a login bounce. At most one extra read,
 * on the same `payload` instance and pool, bounded by a timeout.
 */

/** Payload's `JWT_AUTH_VERSION` (not exported): a token minted by another auth scheme is not a sign-in. */
const JWT_AUTH_VERSION = 1

export type SessionUser = { id: number | string; role?: unknown; disabled?: unknown; collection?: string; [key: string]: unknown }

export type SessionCheck =
  | { outcome: 'valid'; user: SessionUser }
  | { outcome: 'signed-out'; reason: 'no-cookie' | 'bad-token' | 'no-session' | 'no-user' }
  | { outcome: 'error'; reason: 'timeout' | 'lookup-failed' }

export const SESSION_LOOKUP_TIMEOUT_MS = 2000

type AuthConfigSlice = { cookiePrefix: string; csrf: string[] }

/**
 * The sign-in token Payload would accept from a cookie, using Payload's own cross-site rule (a cookie on a cross-site request is
 * ignored). Null means "no usable cookie", which is a signed-out visitor and never a reason to look anything up.
 */
export function sessionToken(headers: Headers, config: AuthConfigSlice): string | null {
  const token = parseCookies(headers).get(`${config.cookiePrefix}-token`)
  if (token === undefined || token === '') return null
  const origin = headers.get('Origin')
  if (origin !== null) return config.csrf.length === 0 || config.csrf.includes(origin) ? token : null
  if (config.csrf.length === 0) return token
  const site = headers.get('Sec-Fetch-Site')
  return site === 'same-origin' || site === 'same-site' || site === 'none' ? token : null
}

const withTimeout = async <T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), ms) })])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function checkSession(
  payload: Pick<Payload, 'secret' | 'config' | 'findByID' | 'collections'>,
  headers: Headers,
  opts: { timeoutMs?: number } = {},
): Promise<SessionCheck> {
  const token = sessionToken(headers, payload.config)
  if (token === null) return { outcome: 'signed-out', reason: 'no-cookie' }

  let claims: { id?: unknown; collection?: unknown; sid?: unknown }
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(payload.secret))
    if (verified.protectedHeader.authVersion !== JWT_AUTH_VERSION) return { outcome: 'signed-out', reason: 'bad-token' }
    claims = verified.payload as typeof claims
  } catch {
    return { outcome: 'signed-out', reason: 'bad-token' } // expired, tampered or signed with another secret
  }
  const { id, collection, sid } = claims
  const idOk = typeof id === 'number' || typeof id === 'string'
  if (!idOk || typeof collection !== 'string' || typeof sid !== 'string') return { outcome: 'signed-out', reason: 'bad-token' }
  if (!Object.hasOwn(payload.collections, collection)) return { outcome: 'signed-out', reason: 'bad-token' }

  try {
    const found = await withTimeout(
      payload.findByID({ collection: collection as 'users', id, depth: 0, overrideAccess: true }) as unknown as Promise<SessionUser | null>,
      opts.timeoutMs ?? SESSION_LOOKUP_TIMEOUT_MS,
    )
    if (found === 'timeout') return { outcome: 'error', reason: 'timeout' }
    const account = found
    if (account === null || account === undefined) return { outcome: 'signed-out', reason: 'no-user' }
    const sessions = Array.isArray(account.sessions) ? (account.sessions as Array<{ id?: unknown }>) : []
    if (!sessions.some((s) => s.id === sid)) return { outcome: 'signed-out', reason: 'no-session' }
    return { outcome: 'valid', user: { ...account, collection } }
  } catch (err) {
    // A missing document is a clean answer (the account is gone); anything else is a failed lookup.
    if ((err as { status?: number }).status === 404) return { outcome: 'signed-out', reason: 'no-user' }
    return { outcome: 'error', reason: 'lookup-failed' }
  }
}
