import { createHmac, timingSafeEqual } from 'node:crypto'
import { FACEBOOK_GRAPH_VERSION, selectorPaths } from '@/config/site'

/**
 * Facebook sign-in, plain `fetch`, no SDK (announce-teams spec 3.5). The club's own Meta app is configured by env
 * (`FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`); with either unset the feature is off (no button, every
 * `/selector/facebook/*` route is a 404). Env is read at call time, never at module scope. Scope is `public_profile` only:
 * nothing about the Facebook profile (not even its email) is used to decide who someone is; only the numeric id, and only after
 * an invite or an authenticated link has said which selector account it belongs to.
 */
export type FacebookConfig = { appId: string; appSecret: string; graphVersion: string }
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function facebookConfig(env: Record<string, string | undefined> = process.env): FacebookConfig | null {
  const appId = env.FACEBOOK_APP_ID?.trim()
  const appSecret = env.FACEBOOK_APP_SECRET?.trim()
  if (!appId || !appSecret) return null
  return { appId, appSecret, graphVersion: env.FACEBOOK_GRAPH_VERSION?.trim() || FACEBOOK_GRAPH_VERSION }
}

export const redirectUri = (origin: string): string => `${origin.replace(/\/+$/, '')}${selectorPaths.facebookCallback}`

/**
 * Meta wants each redirect URI registered exactly, so only the configured origin (production, or the stable preview alias)
 * can sign in with Facebook; any other host shows the password form only.
 */
export function hostSupportsFacebook(origin: string, host: string | null | undefined): boolean {
  if (!host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

export function dialogUrl(cfg: FacebookConfig, opts: { redirectUri: string; state: string }): string {
  const q = new URLSearchParams({ client_id: cfg.appId, redirect_uri: opts.redirectUri, state: opts.state, scope: 'public_profile', response_type: 'code' })
  return `https://www.facebook.com/${cfg.graphVersion}/dialog/oauth?${q}`
}

export class FacebookError extends Error {}

const TIMEOUT_MS = 5000

/** Server-to-server code exchange. The secret travels in a POST body, only here, and is never logged. */
export async function exchangeCode(cfg: FacebookConfig, opts: { code: string; redirectUri: string }, fetchImpl: FetchLike = fetch): Promise<string> {
  const body = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: opts.redirectUri, code: opts.code })
  const res = await fetchImpl(`https://graph.facebook.com/${cfg.graphVersion}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new FacebookError(`token exchange failed (${res.status})`)
  const json = (await res.json().catch(() => null)) as { access_token?: unknown } | null
  if (!json || typeof json.access_token !== 'string' || !json.access_token) throw new FacebookError('token exchange returned no token')
  return json.access_token
}

/** The Facebook user id (and display name, which is never stored). The token is used once and discarded. */
export async function fetchProfile(cfg: FacebookConfig, accessToken: string, fetchImpl: FetchLike = fetch): Promise<{ id: string; name: string }> {
  const res = await fetchImpl(`https://graph.facebook.com/${cfg.graphVersion}/me?fields=id,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new FacebookError(`profile lookup failed (${res.status})`)
  const json = (await res.json().catch(() => null)) as { id?: unknown; name?: unknown } | null
  if (!json || typeof json.id !== 'string' || !/^\d{1,40}$/.test(json.id)) throw new FacebookError('profile had no id')
  return { id: json.id, name: typeof json.name === 'string' ? json.name : '' }
}

/** Meta's `signed_request` (data-deletion and deauthorise callbacks): `base64url(signature).base64url(payload)`. Returns the Facebook user id or null. */
export function verifySignedRequest(signed: unknown, appSecret: string): string | null {
  if (typeof signed !== 'string' || signed.length > 4000) return null
  const [sig, payload, extra] = signed.split('.')
  if (!sig || !payload || extra !== undefined) return null
  const expected = createHmac('sha256', appSecret).update(payload).digest()
  let given: Buffer
  try {
    given = Buffer.from(sig, 'base64url')
  } catch {
    return null
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { algorithm?: unknown; user_id?: unknown }
    if (typeof data.algorithm === 'string' && data.algorithm.toUpperCase() !== 'HMAC-SHA256') return null
    return typeof data.user_id === 'string' && /^\d{1,40}$/.test(data.user_id) ? data.user_id : null
  } catch {
    return null
  }
}

/** Facebook, Messenger and WhatsApp open links in an in-app browser where Facebook sign-in can fail. */
export const looksLikeInAppBrowser = (userAgent: string | null | undefined): boolean => /FBAN|FBAV|FB_IAB|Messenger|WhatsApp/i.test(userAgent ?? '')
