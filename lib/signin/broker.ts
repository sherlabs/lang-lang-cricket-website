import { sql } from '@payloadcms/db-postgres/drizzle'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createLocalJWKSet, decodeProtectedHeader, jwtVerify, type JWK, type JWTPayload } from 'jose'
import type { Payload } from 'payload'
import { BROKER_EVENTS_PATH, selectorPaths } from '@/config/site'
import type { FetchLike } from '@/lib/facebook-login'

/**
 * The shared sign-in broker client (wave F spec 3.3, protocol v1). The club never talks to Facebook in this mode: the broker
 * does, and hands back a 60 second EdDSA assertion naming the app-scoped Facebook id. This module only builds the start URL,
 * verifies the broker's signed assertions and events against its published keys, and checks the connection. `fetch` is always
 * injected so tests and the fake broker never need a network. Env is read at call time.
 */
export type BrokerConfig = { origin: string; clubId: string }
export type Env = Record<string, string | undefined>

const CLUB_ID = /^[a-z0-9-]{1,64}$/
const NONCE = /^[A-Za-z0-9_-]{16,128}$/
const STATE = /^[A-Za-z0-9._~-]{1,256}$/
export const BROKER_NONCE_PATTERN = NONCE
export const BROKER_STATE_PATTERN = STATE

/** The configured broker, or why there is none. Only an https origin (or localhost over http outside production) is accepted. */
export function parseBrokerConfig(env: Env = process.env, production: boolean = env.NODE_ENV === 'production'): { cfg: BrokerConfig | null; reason?: string } {
  const rawOrigin = env.AUTH_BROKER_ORIGIN?.trim()
  const clubId = env.AUTH_BROKER_CLUB_ID?.trim()
  if (!rawOrigin || !clubId) return { cfg: null, reason: 'the broker address and club id are not set on the server' }
  let url: URL
  try {
    url = new URL(rawOrigin)
  } catch {
    return { cfg: null, reason: 'the broker address is not a web address' }
  }
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && !production
  if (url.protocol !== 'https:' && !localHttp) return { cfg: null, reason: 'the broker address must start with https://' }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    return { cfg: null, reason: 'the broker address must be an origin only (no path, query or login)' }
  }
  if (!CLUB_ID.test(clubId)) return { cfg: null, reason: 'the broker club id may only use lowercase letters, digits and dashes' }
  return { cfg: { origin: url.origin, clubId } }
}
export const brokerConfig = (env?: Env, production?: boolean): BrokerConfig | null => parseBrokerConfig(env, production).cfg

export const brokerReturnUrl = (ownOrigin: string): string => `${ownOrigin.replace(/\/+$/, '')}${selectorPaths.facebookBrokerCallback}`

/** The broker's start URL. Carries exactly `club`, `return_to`, `nonce` and `state`. */
export function brokerStartUrl(cfg: BrokerConfig, o: { ownOrigin: string; nonce: string; state: string }): string {
  const q = new URLSearchParams({ club: cfg.clubId, return_to: brokerReturnUrl(o.ownOrigin), nonce: o.nonce, state: o.state })
  return `${cfg.origin}/v1/facebook/start?${q}`
}

/** What this site registers in the broker's CLUBS list (shown to the operator, copy-ready). */
export const brokerRegistration = (cfg: BrokerConfig | null, ownOrigin: string) => ({
  id: cfg?.clubId ?? '<club id>',
  origins: [ownOrigin.replace(/\/+$/, '')],
  returnPath: selectorPaths.facebookBrokerCallback,
  eventsPath: BROKER_EVENTS_PATH,
})

// ---- JWKS -----------------------------------------------------------------------------------------------------------

const JWKS_TTL_MS = 300_000
const JWKS_STALE_MAX_MS = 3_600_000
const JWKS_REFETCH_GAP_MS = 30_000
const FETCH_TIMEOUT_MS = 5000
const BODY_CAP = 16 * 1024

type JwksEntry = { keys: JWK[]; fetchedAt: number; lastForcedAt: number }
const jwksCache = new Map<string, JwksEntry>()
export const resetBrokerCache = (): void => jwksCache.clear()

/** Reads at most `cap` bytes of text; throws when the body is larger. */
async function readCapped(res: Response, cap: number = BODY_CAP): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > cap) throw new Error('body too large')
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > cap) {
      await reader.cancel().catch(() => undefined)
      throw new Error('body too large')
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Only Ed25519 OKP keys with a string kid are usable. */
export function usableKeys(json: unknown): JWK[] {
  const keys = (json as { keys?: unknown } | null)?.keys
  if (!Array.isArray(keys)) return []
  return keys.filter((k): k is JWK => !!k && typeof k === 'object' && (k as JWK).kty === 'OKP' && (k as JWK).crv === 'Ed25519' && typeof (k as JWK).kid === 'string' && (((k as JWK).alg ?? 'EdDSA') === 'EdDSA') && typeof (k as JWK).x === 'string')
}

async function fetchJwks(cfg: BrokerConfig, fetchImpl: FetchLike): Promise<JWK[]> {
  const res = await fetchImpl(`${cfg.origin}/.well-known/jwks.json`, { redirect: 'error', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`jwks ${res.status}`)
  const keys = usableKeys(JSON.parse(await readCapped(res)))
  if (!keys.length) throw new Error('jwks had no usable key')
  return keys
}

/**
 * Keys for the broker, cached 5 minutes. `force` (an unknown kid) refetches at most once per 30 seconds. A stale cache survives a
 * failed refresh for one hour, then verification fails closed. `fetched` says whether this call went to the network.
 */
export async function loadJwks(cfg: BrokerConfig, fetchImpl: FetchLike, now: number, opts: { force?: boolean } = {}): Promise<{ keys: JWK[]; fetched: boolean }> {
  const hit = jwksCache.get(cfg.origin)
  if (hit) {
    const age = now - hit.fetchedAt
    if (!opts.force && age < JWKS_TTL_MS) return { keys: hit.keys, fetched: false }
    if (opts.force && now - hit.lastForcedAt < JWKS_REFETCH_GAP_MS && age < JWKS_STALE_MAX_MS) return { keys: hit.keys, fetched: false }
  }
  try {
    const keys = await fetchJwks(cfg, fetchImpl)
    jwksCache.set(cfg.origin, { keys, fetchedAt: now, lastForcedAt: opts.force ? now : (hit?.lastForcedAt ?? 0) })
    return { keys, fetched: true }
  } catch (err) {
    if (hit && now - hit.fetchedAt < JWKS_STALE_MAX_MS) {
      console.warn(`[signin-broker] key refresh failed, using cached keys: ${(err as Error).message.slice(0, 60)}`)
      return { keys: hit.keys, fetched: false }
    }
    throw err
  }
}
export const getJwks = async (cfg: BrokerConfig, fetchImpl: FetchLike, now: number, opts: { force?: boolean } = {}): Promise<JWK[]> => (await loadJwks(cfg, fetchImpl, now, opts)).keys

// ---- Verification ---------------------------------------------------------------------------------------------------

export type BrokerEventType = 'facebook.data_deletion' | 'facebook.deauthorize'
export const EVENT_TYPES: readonly BrokerEventType[] = ['facebook.data_deletion', 'facebook.deauthorize']
export type VerifiedClaims = { sub: string; jti: string; exp: number; iat: number; type?: BrokerEventType }
export type VerifyResult = { ok: true; claims: VerifiedClaims } | { ok: false; reason: string }

const MAX_TOKEN = 4000
const MAX_LIFETIME_S = { assertion: 120, event: 600 } as const
const eq = (a: string, b: string): boolean => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type VerifyOpts = {
  cfg: BrokerConfig
  /** `payload.config.serverURL`, never the Host header. */
  ownOrigin: string
  kind: 'assertion' | 'event'
  /** Assertions: the nonce in the signed cookie. */
  expectNonce?: string
  fetch?: FetchLike
  now?: number
}

export async function verifyBrokerJwt(token: unknown, o: VerifyOpts): Promise<VerifyResult> {
  const bad = (reason: string): VerifyResult => ({ ok: false, reason })
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN) return bad('token missing or too long')
  const now = o.now ?? Date.now()
  const fetchImpl = o.fetch ?? fetch
  let kid: string | undefined
  try {
    const header = decodeProtectedHeader(token)
    if (header.alg !== 'EdDSA') return bad('algorithm not allowed')
    kid = header.kid
  } catch {
    return bad('not a token')
  }
  if (!kid) return bad('no key id')
  let payload: JWTPayload
  try {
    const first = await loadJwks(o.cfg, fetchImpl, now)
    let keys = first.keys
    // An unknown kid may be a rotated key: look once more, unless these keys were only just fetched.
    if (!keys.some((k) => k.kid === kid) && !first.fetched) keys = await getJwks(o.cfg, fetchImpl, now, { force: true })
    if (!keys.some((k) => k.kid === kid)) return bad('unknown key')
    const res = await jwtVerify(token, createLocalJWKSet({ keys }), {
      issuer: o.cfg.origin,
      audience: o.ownOrigin.replace(/\/+$/, ''),
      algorithms: ['EdDSA'],
      clockTolerance: 5,
      currentDate: new Date(now),
    })
    payload = res.payload
  } catch (err) {
    return bad(`verification failed (${(err as Error).name || 'error'})`)
  }
  const { iat, exp, sub, jti } = payload
  if (typeof iat !== 'number' || typeof exp !== 'number') return bad('no lifetime')
  if (iat * 1000 > now + 5000) return bad('issued in the future')
  if (exp - iat > MAX_LIFETIME_S[o.kind] || exp <= iat) return bad('lifetime too long')
  if (typeof sub !== 'string' || !/^\d{1,40}$/.test(sub)) return bad('bad subject')
  if (typeof jti !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(jti)) return bad('bad token id')
  if (o.kind === 'assertion') {
    if (payload.club !== o.cfg.clubId) return bad('wrong club')
    if (!Array.isArray(payload.amr) || !payload.amr.includes('facebook')) return bad('not a facebook sign-in')
    if (typeof payload.nonce !== 'string' || !o.expectNonce || !eq(payload.nonce, o.expectNonce)) return bad('nonce mismatch')
    return { ok: true, claims: { sub, jti, exp, iat } }
  }
  const type = payload.type
  if (typeof type !== 'string' || !EVENT_TYPES.includes(type as BrokerEventType)) return bad('event type not allowed')
  return { ok: true, claims: { sub, jti, exp, iat, type: type as BrokerEventType } }
}

/** One atomic statement; true means this assertion id had not been seen before. */
export async function consumeJti(payload: Payload, jti: string, expSeconds: number): Promise<boolean> {
  const res = await payload.db.drizzle.execute(
    sql`INSERT INTO "payload"."auth_broker_jtis" ("jti", "expires_at", "created_at", "updated_at") VALUES (${jti}, to_timestamp(${expSeconds}), now(), now()) ON CONFLICT ("jti") DO NOTHING RETURNING "id"`,
  )
  return res.rows.length === 1
}

/** Replay records are only needed until the assertion expires; keep them one day for the audit, then forget them. */
export async function sweepJtis(payload: Payload): Promise<void> {
  await payload.db.drizzle.execute(sql`DELETE FROM "payload"."auth_broker_jtis" WHERE "expires_at" < now() - interval '1 day'`)
}

// ---- Test connection ------------------------------------------------------------------------------------------------

export type ConnectionCheck = { name: 'health' | 'keys' | 'registration'; ok: boolean; text: string }
export type ConnectionResult = { ok: boolean; summary: string; checks: ConnectionCheck[] }

/** Three read-only calls, only ever to the configured broker origin. Facebook itself is never contacted (the probe is not followed). */
export async function testConnection(cfg: BrokerConfig, ownOrigin: string, fetchImpl: FetchLike = fetch): Promise<ConnectionResult> {
  const checks: ConnectionCheck[] = []
  const call = async (path: string, redirect: RequestRedirect) => fetchImpl(`${cfg.origin}${path}`, { redirect, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } })
  const guard = async (name: ConnectionCheck['name'], run: () => Promise<{ ok: boolean; text: string }>): Promise<void> => {
    try {
      checks.push({ name, ...(await run()) })
    } catch (err) {
      const e = err as Error
      checks.push({ name, ok: false, text: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'The broker took too long to answer.' : e.message === 'body too large' ? 'The broker sent an unexpectedly large answer.' : 'Could not reach the broker.' })
    }
  }
  await guard('health', async () => {
    const res = await call('/healthz', 'error')
    if (!res.ok) return { ok: false, text: `The broker answered ${res.status}.` }
    const json = JSON.parse(await readCapped(res)) as { ok?: unknown; facebookConfigured?: unknown; keys?: unknown }
    if (json.ok !== true) return { ok: false, text: 'The broker says it is not healthy.' }
    return { ok: true, text: `The broker is up${json.facebookConfigured === true ? ' and has its Facebook app' : ', but has no Facebook app yet'}.` }
  })
  await guard('keys', async () => {
    const res = await call('/.well-known/jwks.json', 'error')
    if (!res.ok) return { ok: false, text: `The broker's keys answered ${res.status}.` }
    const n = usableKeys(JSON.parse(await readCapped(res))).length
    return n ? { ok: true, text: `The broker publishes ${n} signing key${n === 1 ? '' : 's'}.` } : { ok: false, text: 'The broker publishes no usable signing key.' }
  })
  await guard('registration', async () => {
    const q = new URLSearchParams({ club: cfg.clubId, return_to: brokerReturnUrl(ownOrigin), nonce: randomBytes(24).toString('base64url'), state: randomBytes(24).toString('base64url') })
    const res = await call(`/v1/facebook/start?${q}`, 'manual')
    if (res.status >= 300 && res.status < 400) return { ok: true, text: 'This club and return address are registered at the broker.' }
    if (res.status === 400) return { ok: false, text: 'This club or return address is not registered in the broker.' }
    if (res.status === 503) return { ok: false, text: 'The broker has no Facebook app set up yet.' }
    return { ok: false, text: `The registration check answered ${res.status}.` }
  })
  const ok = checks.every((c) => c.ok)
  return { ok, summary: ok ? 'The shared broker is reachable and this club is registered.' : checks.find((c) => !c.ok)!.text, checks }
}
