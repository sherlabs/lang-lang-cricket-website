import type { Payload } from 'payload'
import { selectorPaths } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { dialogUrl, exchangeCode, facebookConfig, fetchProfile, hostSupportsFacebook, redirectUri, verifySignedRequest, type FetchLike } from '@/lib/facebook-login'
import { newNonce, oauthCookieName, readCookie, serializeOAuthCookie, signOAuthCookie, stateFor, stateMatches, verifyOAuthCookie } from '@/lib/oauth-cookie'
import { safeNext } from '@/lib/safe-next'
import { consumeInvite, findInvitee, looksLikeInviteToken } from '@/lib/selector-invite'
import { mintSelectorSession } from '@/lib/selector-session'
import { ipHit } from '@/lib/throttle'
import { isSelectorUser } from '@/payload/access'

/**
 * The route logic of Facebook sign-in (spec 3.5), kept out of the route files so the int tests can drive it with an injected
 * `fetch` and no network. Routes are thin wrappers. Everything here is invite-only: it never creates a user, never compares any
 * Facebook email (it never asks for one), and only ever matches `role = selector` rows.
 */
export type OAuthDeps = { payload: Payload; fetch?: FetchLike; env?: Record<string, string | undefined>; production?: boolean; now?: () => number }

const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

export type FailureCode = 'cancelled' | 'failed' | 'not-linked' | 'busy'
export const FAILURE_MESSAGES: Record<FailureCode, string> = {
  cancelled: 'Facebook sign-in was cancelled.',
  failed: 'Facebook sign-in did not work. Try again, or sign in with your password.',
  'not-linked': 'That Facebook account is not linked to a selector login. Ask the committee for a new invite link, or sign in with your password and link Facebook from My account.',
  busy: 'Too many tries. Please wait a few minutes and try again.',
}
export const isFailureCode = (v: unknown): v is FailureCode => typeof v === 'string' && v in FAILURE_MESSAGES

function redirect(to: string, origin: string, headers: Array<[string, string]> = []): Response {
  const res = new Response(null, { status: 302, headers: { Location: new URL(to, origin).toString(), ...NO_STORE } })
  for (const [k, v] of headers) res.headers.append(k, v)
  return res
}
const notFound = () => new Response('Not found', { status: 404, headers: NO_STORE })

/** Server logs never carry a token, a code or the app secret: only a short reason. */
const log = (reason: string) => console.warn(`[selector-facebook] ${reason}`)

/** GET /selector/facebook/start?next=&invite=&link=1 */
export async function handleStart(request: Request, deps: OAuthDeps): Promise<Response> {
  const cfg = facebookConfig(deps.env)
  const origin = deps.payload.config.serverURL
  const url = new URL(request.url)
  if (!cfg || !hostSupportsFacebook(origin, request.headers.get('host') ?? url.host)) return notFound()
  const production = deps.production ?? process.env.NODE_ENV === 'production'
  if (!(await ipHit(deps.payload, 'sel-oauth', clientIp(request.headers))).allowed) return redirect(`${selectorPaths.login}?e=busy`, origin)

  const next = safeNext(url.searchParams.get('next'))
  const inviteParam = url.searchParams.get('invite')
  let invite: string | undefined
  let userId: number | undefined
  if (inviteParam) {
    // The invite page is where a bad token is explained; here it only has to look right and still be open.
    if (!looksLikeInviteToken(inviteParam) || !(await findInvitee(deps.payload, inviteParam))) return redirect(selectorPaths.invite(looksLikeInviteToken(inviteParam) ? inviteParam : 'invalid'), origin)
    invite = inviteParam
  } else if (url.searchParams.get('link') === '1') {
    const { pageAuthHeaders } = await import('@/lib/selector-auth')
    const { user } = await deps.payload.auth({ headers: pageAuthHeaders(request.headers) })
    if (!isSelectorUser(user)) return redirect(`${selectorPaths.login}?next=${encodeURIComponent(selectorPaths.account)}`, origin)
    userId = Number(user!.id)
  }
  const nonce = newNonce()
  const cookie = signOAuthCookie({ nonce, next, iat: (deps.now ?? Date.now)(), ...(invite ? { invite } : {}), ...(userId ? { userId } : {}) })
  const to = dialogUrl(cfg, { redirectUri: redirectUri(origin), state: stateFor(nonce) })
  const res = new Response(null, { status: 302, headers: { Location: to, ...NO_STORE } })
  res.headers.append('Set-Cookie', serializeOAuthCookie(cookie, production))
  return res
}

/** GET /selector/facebook/callback?code=&state= (or ?error=) */
export async function handleCallback(request: Request, deps: OAuthDeps): Promise<Response> {
  const cfg = facebookConfig(deps.env)
  const origin = deps.payload.config.serverURL
  if (!cfg) return notFound()
  const production = deps.production ?? process.env.NODE_ENV === 'production'
  const clear = (): Array<[string, string]> => [['Set-Cookie', serializeOAuthCookie(null, production)]]
  const url = new URL(request.url)
  const fail = (code: FailureCode, why: string, back: string = selectorPaths.login): Response => {
    log(why)
    const sep = back.includes('?') ? '&' : '?'
    return redirect(`${back}${sep}e=${code}`, origin, clear())
  }

  if (!(await ipHit(deps.payload, 'sel-oauth', clientIp(request.headers))).allowed) return fail('busy', 'ip throttled')

  // 1. The cookie: present, signed by us, fresh. It is cleared on every path below (single use).
  const raw = readCookie(request.headers.get('cookie'), oauthCookieName(production))
  const cookie = verifyOAuthCookie(raw, (deps.now ?? Date.now)())
  if (!cookie) return fail('failed', 'missing, tampered or expired oauth cookie')
  // 2. State derived from the cookie-only nonce, compared in constant time.
  if (!stateMatches(cookie, url.searchParams.get('state'))) return fail('failed', 'state mismatch')
  // 3. An invite carried by the cookie is re-validated NOW, not trusted from /start.
  const back = cookie.invite ? selectorPaths.invite(cookie.invite) : selectorPaths.login
  if (cookie.invite && !(await findInvitee(deps.payload, cookie.invite))) return fail('failed', 'invite no longer open', selectorPaths.login)
  if (url.searchParams.get('error')) return fail('cancelled', `facebook returned error=${url.searchParams.get('error')}`, back)
  const code = url.searchParams.get('code')
  if (!code || code.length > 2000) return fail('failed', 'no code', back)

  // 4. Server to server: the secret and the token never reach the browser or the logs. Only the numeric id is kept.
  let facebookId: string
  try {
    const token = await exchangeCode(cfg, { code, redirectUri: redirectUri(origin) }, deps.fetch)
    facebookId = (await fetchProfile(cfg, token, deps.fetch)).id
  } catch (err) {
    return fail('failed', `graph call failed: ${(err as Error).message}`, back)
  }

  const resolved = await resolveAccount(request, deps.payload, cookie, facebookId)
  if (!resolved) return fail('not-linked', 'no selector for this facebook id', back)

  // 5. A brand-new session (new sid); any earlier payload-token is overwritten, never reused.
  let session: { cookie: string }
  try {
    session = await mintSelectorSession(deps.payload, resolved, 'facebook')
  } catch (err) {
    return fail('failed', `could not start a session: ${(err as Error).message}`, back)
  }
  return redirect(cookie.next, origin, [...clear(), ['Set-Cookie', session.cookie]])
}

type CookieData = NonNullable<ReturnType<typeof verifyOAuthCookie>>

/** Spec 3.5 step 4: a, b, c, else nothing. Returns the selector's user id, or null. */
async function resolveAccount(request: Request, payload: Payload, cookie: CookieData, facebookId: string): Promise<number | null> {
  // a. Already linked.
  const found = await payload.find({ collection: 'users', where: { facebookId: { equals: facebookId } }, limit: 2, depth: 0, overrideAccess: true, select: { role: true, disabled: true } })
  const row = found.docs[0]
  if (row) {
    if (row.role !== 'selector') {
      log('a facebook id is attached to a non-selector row; refused')
      return null
    }
    return row.disabled ? null : Number(row.id)
  }
  // b. A valid, unexpired, single-use invite binds it (one atomic statement; a unique-index clash leaves the invite open).
  if (cookie.invite) {
    try {
      const invitee = await consumeInvite(payload, cookie.invite, { facebookId })
      return invitee ? invitee.id : null
    } catch (err) {
      log(`bind with invite failed: ${(err as Error).message.slice(0, 80)}`)
      return null
    }
  }
  // c. The authenticated link flow: the signed-in selector who started it, and still is.
  if (cookie.userId) {
    const { pageAuthHeaders } = await import('@/lib/selector-auth')
    const { user } = await payload.auth({ headers: pageAuthHeaders(request.headers) })
    if (!isSelectorUser(user) || Number(user!.id) !== cookie.userId) return null
    try {
      await payload.update({ collection: 'users', id: cookie.userId, data: { facebookId }, overrideAccess: true, context: { facebookBind: true, disableRevalidate: true } })
      return cookie.userId
    } catch (err) {
      log(`link failed: ${(err as Error).message.slice(0, 80)}`)
      return null
    }
  }
  return null
}

/**
 * POST /selector/facebook/data-deletion and /deauthorize (Meta calls these server to server; no cookie, no session, no throttle).
 * A valid `signed_request` removes the Facebook link of that user id; the committee's account stays.
 */
export async function handleDataCallback(request: Request, deps: OAuthDeps, kind: 'deletion' | 'deauthorize'): Promise<Response> {
  const cfg = facebookConfig(deps.env)
  if (!cfg) return notFound()
  const form = await request.formData().catch(() => null)
  const fbId = verifySignedRequest(form?.get('signed_request'), cfg.appSecret)
  if (!fbId) return new Response(JSON.stringify({ error: 'invalid signed_request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
  await deps.payload.update({ collection: 'users', where: { facebookId: { equals: fbId } }, data: { facebookId: null }, overrideAccess: true, context: { disableRevalidate: true } })
  if (kind === 'deauthorize') return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
  const confirmation = newNonce().slice(0, 24)
  const origin = deps.payload.config.serverURL
  return new Response(JSON.stringify({ url: `${origin}${selectorPaths.facebookDeletionStatus}?code=${confirmation}`, confirmation_code: confirmation }), { status: 200, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
}
