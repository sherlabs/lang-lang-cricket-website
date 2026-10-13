import type { Payload, Where } from 'payload'
import { selectorPaths } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { dialogUrl, exchangeCode, facebookConfig, fetchProfile, redirectUri, verifySignedRequest, type FetchLike } from '@/lib/facebook-login'
import { newNonce, oauthCookieName, readCookie, serializeOAuthCookie, signOAuthCookie, stateFor, stateMatches, verifyOAuthCookie } from '@/lib/oauth-cookie'
import { safeNext } from '@/lib/safe-next'
import { consumeInvite, findInvitee, looksLikeInviteToken } from '@/lib/selector-invite'
import { mintSelectorSession } from '@/lib/selector-session'
import { brokerConfig, brokerStartUrl, consumeJti, verifyBrokerJwt } from '@/lib/signin/broker'
import { requestHost, resolveSignIn, type SignInMode } from '@/lib/signin/mode'
import { recordUnlinks } from '@/lib/signin/state'
import { BROKER_BAD_RULE, hit, ipHit } from '@/lib/throttle'
import { isSelectorUser } from '@/payload/access'

/**
 * The route logic of Facebook sign-in (spec 3.5), kept out of the route files so the int tests can drive it with an injected
 * `fetch` and no network. Routes are thin wrappers. Everything here is invite-only: it never creates a user, never compares any
 * Facebook email (it never asks for one), and only ever matches `role = selector` rows.
 */
type CookieData = NonNullable<ReturnType<typeof verifyOAuthCookie>>
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
const modeFor = (request: Request, deps: OAuthDeps): Promise<SignInMode> => resolveSignIn(deps.payload, { env: deps.env, host: requestHost(request) })

/** Server logs never carry a token, a code or the app secret: only a short reason. */
const log = (reason: string) => console.warn(`[selector-facebook] ${reason}`)

/** GET /selector/facebook/start?next=&invite=&link=1 */
export async function handleStart(request: Request, deps: OAuthDeps): Promise<Response> {
  const origin = deps.payload.config.serverURL
  const url = new URL(request.url)
  // Off, unconfigured, or not the registered host: a 404, as if the feature did not exist.
  const mode = await modeFor(request, deps)
  if (mode.kind === 'off') return notFound()
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
  // `own-app`: the club's own Meta app. `broker`: the shared broker, which gets the same nonce and a state derived from it.
  const to = mode.kind === 'broker'
    ? brokerStartUrl(brokerConfig(deps.env)!, { ownOrigin: origin, nonce, state: stateFor(nonce) })
    : dialogUrl(facebookConfig(deps.env)!, { redirectUri: redirectUri(origin), state: stateFor(nonce) })
  const res = new Response(null, { status: 302, headers: { Location: to, ...NO_STORE } })
  res.headers.append('Set-Cookie', serializeOAuthCookie(cookie, production))
  return res
}

/** GET /selector/facebook/callback?code=&state= (or ?error=) */
export async function handleCallback(request: Request, deps: OAuthDeps): Promise<Response> {
  const origin = deps.payload.config.serverURL
  if ((await modeFor(request, deps)).kind !== 'own-app') return notFound()
  const cfg = facebookConfig(deps.env)!
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
  if (url.searchParams.get('error')) return fail('cancelled', `facebook returned error=${logSafe(url.searchParams.get('error'))}`, back)
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

  return finishSignIn(request, deps, cookie, facebookId, 'own', { origin, clear, fail, back })
}

type SignInContext = { origin: string; clear: () => Array<[string, string]>; fail: (code: FailureCode, why: string, back?: string) => Response; back: string }

/** The end of both flows: find or bind the selector for this verified Facebook id, then start a brand-new session. */
async function finishSignIn(request: Request, deps: OAuthDeps, cookie: CookieData, facebookId: string, via: Via, c: SignInContext): Promise<Response> {
  const resolved = await finishFacebookSignIn(request, deps, cookie, facebookId, via)
  if (!resolved) return c.fail('not-linked', 'no selector for this facebook id', c.back)
  // A brand-new session (new sid); any earlier payload-token is overwritten, never reused.
  let session: { cookie: string }
  try {
    session = await mintSelectorSession(deps.payload, resolved, 'facebook')
  } catch (err) {
    return c.fail('failed', `could not start a session: ${(err as Error).message}`, c.back)
  }
  return redirect(cookie.next, c.origin, [...c.clear(), ['Set-Cookie', session.cookie]])
}

export type Via = 'own' | 'broker'

/** The accounts whose id lives in the same Meta app as `via`; a row with no recorded space counts as the club's own app. */
const inSpace = (via: Via): Where => (via === 'broker' ? { facebookIdVia: { equals: 'broker' } } : { or: [{ facebookIdVia: { equals: 'own' } }, { facebookIdVia: { exists: false } }] })

/**
 * Spec 3.5 step 4, shared by the direct flow and the broker flow so the invite rules exist exactly once: a. already linked,
 * b. a valid invite binds it, c. the authenticated link flow, else nothing. The lookup is scoped to the id space (`via`): an
 * app-scoped id from the broker's Meta app is a different namespace from the club's own app, so equal digits never match across
 * them. Only `selector` rows are ever signed in or bound. Returns the selector's user id, or null.
 */
export async function finishFacebookSignIn(request: Request, deps: OAuthDeps, cookie: CookieData, facebookId: string, via: Via): Promise<number | null> {
  const payload = deps.payload
  // a. Already linked.
  const found = await payload.find({ collection: 'users', where: { and: [{ facebookId: { equals: facebookId } }, inSpace(via)] }, limit: 2, depth: 0, overrideAccess: true, select: { role: true, disabled: true } })
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
      const invitee = await consumeInvite(payload, cookie.invite, { facebookId, via })
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
      await payload.update({ collection: 'users', id: cookie.userId, data: { facebookId }, overrideAccess: true, context: { facebookBind: true, facebookVia: via, disableRevalidate: true } })
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
  if ((await modeFor(request, deps)).kind !== 'own-app') return notFound()
  const cfg = facebookConfig(deps.env)!
  const form = await request.formData().catch(() => null)
  const fbId = verifySignedRequest(form?.get('signed_request'), cfg.appSecret)
  if (!fbId) return new Response(JSON.stringify({ error: 'invalid signed_request' }), { status: 400, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
  // Only ids from the club's own app: an equal-looking id bound through the shared broker belongs to someone else.
  await deps.payload.update({ collection: 'users', where: { and: [{ facebookId: { equals: fbId } }, inSpace('own')] }, data: { facebookId: null }, overrideAccess: true, context: { disableRevalidate: true } })
  if (kind === 'deauthorize') return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
  const confirmation = newNonce().slice(0, 24)
  const origin = deps.payload.config.serverURL
  return new Response(JSON.stringify({ url: `${origin}${selectorPaths.facebookDeletionStatus}?code=${confirmation}`, confirmation_code: confirmation }), { status: 200, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
}

/** A value from the query string, safe to log: control characters removed, 40 characters at most. */
const logSafe = (v: string | null): string => (v ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 40)

/**
 * GET /selector/facebook/broker-callback?websport_assertion=&state= (or ?websport_error=&state=). Where the shared broker sends the
 * person back. 404 unless the effective mode is `broker`. The cookie, the state check and the invite rules are the direct flow's;
 * the proof of who signed in is the broker's signed assertion, spent once through `auth_broker_jtis`.
 */
export async function handleBrokerCallback(request: Request, deps: OAuthDeps): Promise<Response> {
  const origin = deps.payload.config.serverURL
  if ((await modeFor(request, deps)).kind !== 'broker') return notFound()
  const cfg = brokerConfig(deps.env)!
  const production = deps.production ?? process.env.NODE_ENV === 'production'
  const clear = (): Array<[string, string]> => [['Set-Cookie', serializeOAuthCookie(null, production)]]
  const url = new URL(request.url)
  const fail = (code: FailureCode, why: string, back: string = selectorPaths.login): Response => {
    log(`broker: ${why}`)
    const sep = back.includes('?') ? '&' : '?'
    return redirect(`${back}${sep}e=${code}`, origin, clear())
  }
  if (!(await ipHit(deps.payload, 'sel-oauth', clientIp(request.headers))).allowed) return fail('busy', 'ip throttled')

  const raw = readCookie(request.headers.get('cookie'), oauthCookieName(production))
  const cookie = verifyOAuthCookie(raw, (deps.now ?? Date.now)())
  if (!cookie) return fail('failed', 'missing, tampered or expired oauth cookie')
  if (!stateMatches(cookie, url.searchParams.get('state'))) return fail('failed', 'state mismatch')
  const back = cookie.invite ? selectorPaths.invite(cookie.invite) : selectorPaths.login
  if (cookie.invite && !(await findInvitee(deps.payload, cookie.invite))) return fail('failed', 'invite no longer open', selectorPaths.login)
  const brokerError = url.searchParams.get('websport_error')
  if (brokerError) return fail(brokerError === 'denied' ? 'cancelled' : 'failed', `broker returned error=${logSafe(brokerError)}`, back)

  const verified = await verifyBrokerJwt(url.searchParams.get('websport_assertion'), { cfg, ownOrigin: origin, kind: 'assertion', expectNonce: cookie.nonce, fetch: deps.fetch, now: deps.now?.() })
  if (!verified.ok) return fail('failed', `assertion rejected (${verified.reason})`, back)
  if (!(await consumeJti(deps.payload, verified.claims.jti, verified.claims.exp))) return fail('failed', 'assertion already used', back)
  return finishSignIn(request, deps, cookie, verified.claims.sub, 'broker', { origin, clear, fail, back })
}

const json = (body: unknown, status: number): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE } })
const EVENT_BODY_MAX = 8 * 1024

/**
 * POST /api/websport-auth/events. The broker tells the club that someone removed the app or asked for their data to be deleted.
 * 404 unless the mode is `broker`. The signature is checked first; only a valid event unlinks (rows bound through the broker,
 * never the club's own-app ones). A valid event always answers 200 `{}` (no one can ask who is a member), and a redelivery just
 * unlinks nothing. Only FAILED requests count towards the flood ceiling, so a flood of junk can never starve a real deletion.
 */
export async function handleBrokerEvent(request: Request, deps: OAuthDeps): Promise<Response> {
  if ((await modeFor(request, deps)).kind !== 'broker') return notFound()
  const cfg = brokerConfig(deps.env)!
  const bad = async (why: string): Promise<Response> => {
    const gate = await hit(deps.payload, 'broker-events:bad', BROKER_BAD_RULE)
    const ip = await ipHit(deps.payload, 'broker-bad', clientIp(request.headers))
    if (!gate.allowed || !ip.allowed) return json({ error: 'too many requests' }, 429)
    log(`broker event rejected (${why})`)
    return json({ error: 'invalid event' }, 400)
  }
  if (!/^application\/json\b/i.test(request.headers.get('content-type') ?? '')) return bad('content type')
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > EVENT_BODY_MAX) return bad('body too large')
  const text = await request.text().catch(() => '')
  if (!text || Buffer.byteLength(text) > EVENT_BODY_MAX) return bad('body size')
  let event: unknown
  try {
    event = (JSON.parse(text) as { event?: unknown } | null)?.event
  } catch {
    return bad('not json')
  }
  const verified = await verifyBrokerJwt(event, { cfg, ownOrigin: deps.payload.config.serverURL, kind: 'event', fetch: deps.fetch, now: deps.now?.() })
  if (!verified.ok) return bad(verified.reason)
  // Both event types end the same way: the club stores only the id, so unlinking is the deletion.
  const res = await deps.payload.update({ collection: 'users', where: { and: [{ facebookId: { equals: verified.claims.sub } }, { facebookIdVia: { equals: 'broker' } }] }, data: { facebookId: null }, overrideAccess: true, context: { disableRevalidate: true } })
  await recordUnlinks(deps.payload, res.docs.length).catch((err) => log(`could not record the unlink: ${(err as Error).message.slice(0, 60)}`))
  return json({}, 200)
}
