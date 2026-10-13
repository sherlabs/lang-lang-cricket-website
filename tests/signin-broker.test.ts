import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BROKER_NONCE_PATTERN, BROKER_STATE_PATTERN, brokerConfig, brokerRegistration, brokerStartUrl, parseBrokerConfig, resetBrokerCache, testConnection, usableKeys, verifyBrokerJwt, type BrokerConfig } from '../lib/signin/broker'
import { newNonce, stateFor } from '../lib/oauth-cookie'
import { createFakeBroker, newKey, type FakeBroker } from './helpers/fake-broker'

const ORIGIN = 'https://broker.example'
const OWN = 'https://club.example'
const CFG: BrokerConfig = { origin: ORIGIN, clubId: 'demo-club' }
const NONCE = newNonce()
const T0 = 1_800_000_000_000

let b: FakeBroker
beforeEach(async () => {
  resetBrokerCache()
  b = await createFakeBroker({ origin: ORIGIN, clubId: CFG.clubId, ownOrigin: OWN })
  vi.restoreAllMocks()
})

const verify = (token: unknown, over: Partial<Parameters<typeof verifyBrokerJwt>[1]> = {}) =>
  verifyBrokerJwt(token, { cfg: CFG, ownOrigin: OWN, kind: 'assertion', expectNonce: NONCE, fetch: b.fetch, now: T0, ...over })
const at = (s = 0) => Math.floor(T0 / 1000) + s
const jwksFetches = () => b.calls.filter((c) => c.endsWith('/.well-known/jwks.json')).length

describe('brokerConfig', () => {
  it('accepts an https origin and a club id', () => {
    expect(brokerConfig({ AUTH_BROKER_ORIGIN: 'https://broker.example/', AUTH_BROKER_CLUB_ID: 'my-club' })).toEqual({ origin: 'https://broker.example', clubId: 'my-club' })
  })
  it('is off when either value is missing', () => {
    expect(parseBrokerConfig({}).cfg).toBeNull()
    expect(parseBrokerConfig({ AUTH_BROKER_ORIGIN: ORIGIN }).cfg).toBeNull()
    expect(parseBrokerConfig({ AUTH_BROKER_CLUB_ID: 'x' }).reason).toMatch(/not set/)
  })
  it('rejects http (except localhost outside production), paths, queries, credentials and bad club ids', () => {
    const c = (o: string, id = 'ok-club', env: Record<string, string> = {}) => parseBrokerConfig({ AUTH_BROKER_ORIGIN: o, AUTH_BROKER_CLUB_ID: id, ...env }).cfg
    expect(c('http://broker.example')).toBeNull()
    expect(c('http://127.0.0.1:4455')).not.toBeNull()
    expect(c('http://localhost:4455')).not.toBeNull()
    expect(c('http://127.0.0.1:4455', 'ok-club', { NODE_ENV: 'production' })).toBeNull()
    expect(c('https://broker.example/path')).toBeNull()
    expect(c('https://broker.example/?a=1')).toBeNull()
    expect(c('https://broker.example/#x')).toBeNull()
    expect(c('https://user:pw@broker.example')).toBeNull()
    expect(c('not a url')).toBeNull()
    for (const id of ['', 'Upper', 'has space', 'a'.repeat(65), 'under_score']) expect(c(ORIGIN, id)).toBeNull()
  })
  it('states the registration this site needs', () => {
    expect(brokerRegistration(CFG, `${OWN}/`)).toEqual({ id: 'demo-club', origins: [OWN], returnPath: '/selector/facebook/broker-callback', eventsPath: '/api/websport-auth/events' })
  })
})

describe('start URL', () => {
  it('carries exactly club, return_to, nonce and state, inside the broker patterns', () => {
    const nonce = newNonce()
    const u = new URL(brokerStartUrl(CFG, { ownOrigin: OWN, nonce, state: stateFor(nonce, 'a-test-secret-of-some-length-1234567') }))
    expect(u.origin + u.pathname).toBe(`${ORIGIN}/v1/facebook/start`)
    expect([...u.searchParams.keys()].sort()).toEqual(['club', 'nonce', 'return_to', 'state'])
    expect(u.searchParams.get('club')).toBe('demo-club')
    expect(u.searchParams.get('return_to')).toBe(`${OWN}/selector/facebook/broker-callback`)
    expect(u.searchParams.get('nonce')).toMatch(BROKER_NONCE_PATTERN)
    expect(u.searchParams.get('state')).toMatch(BROKER_STATE_PATTERN)
    expect(u.searchParams.get('nonce')).toBe(nonce)
  })
})

describe('verifyBrokerJwt: assertions', () => {
  it('accepts a good assertion', async () => {
    const r = await verify(await b.assertion({ sub: '1234567890', nonce: NONCE }, { iat: at(), exp: at(60) }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.claims.sub).toBe('1234567890')
  })
  const reject = async (token: string, why: RegExp | string, over = {}) => {
    const r = await verify(token, over)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(why)
  }
  it('rejects a wrong issuer, audience, club or nonce', async () => {
    await reject(await b.assertion({ sub: '1', nonce: NONCE }, { iss: 'https://evil.example', iat: at(), exp: at(60) }), /verification failed/)
    await reject(await b.assertion({ sub: '1', nonce: NONCE }, { aud: 'https://other.example', iat: at(), exp: at(60) }), /verification failed/)
    await reject(await b.assertion({ sub: '1', nonce: NONCE, club: 'other-club' }, { iat: at(), exp: at(60) }), /wrong club/)
    await reject(await b.assertion({ sub: '1', nonce: newNonce() }, { iat: at(), exp: at(60) }), /nonce/)
    await reject(await b.assertion({ sub: '1', nonce: NONCE, amr: ['pwd'] }, { iat: at(), exp: at(60) }), /not a facebook/)
  })
  it('rejects expired, future-dated and long-lived tokens', async () => {
    await reject(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(-200), exp: at(-100) }), /verification failed/)
    await reject(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(120), exp: at(180) }), /(future|verification failed)/)
    await reject(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(3600) }), /lifetime/)
  })
  it('rejects a tampered payload, alg none and an HS256 token keyed with the public key', async () => {
    const good = await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(60) })
    const [h, p, s] = good.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: '999' })).toString('base64url')
    await reject(`${h}.${forged}.${s}`, /verification failed/)
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'key-1' })).toString('base64url')}.${p}.`
    await reject(none, /algorithm/)
    const x = Buffer.from(b.keys[0].jwk.x!, 'base64url')
    const hs = await new SignJWT({ sub: '1', club: 'demo-club', nonce: NONCE, amr: ['facebook'], jti: 'a'.repeat(20) }).setProtectedHeader({ alg: 'HS256', kid: 'key-1' }).setIssuer(ORIGIN).setAudience(OWN).setIssuedAt(at()).setExpirationTime(at(60)).sign(x)
    await reject(hs, /algorithm/)
  })
  it('rejects oversize tokens, bad subjects and bad token ids', async () => {
    await reject('a'.repeat(4001), /too long/)
    await reject(await b.assertion({ sub: 'abc', nonce: NONCE }, { iat: at(), exp: at(60) }), /subject/)
    await reject(await b.assertion({ sub: '1'.repeat(41), nonce: NONCE }, { iat: at(), exp: at(60) }), /subject/)
    await reject(await b.assertion({ sub: '1', nonce: NONCE, jti: 'short' }, { iat: at(), exp: at(60) }), /token id/)
    expect((await verify(undefined)).ok).toBe(false)
    expect((await verify('not.a.token')).ok).toBe(false)
  })
})

describe('verifyBrokerJwt: events', () => {
  const ev = (o: Parameters<FakeBroker['event']>[0], opts = {}) => b.event(o, { iat: at(), exp: at(300), ...opts })
  it('accepts both event types and needs no club or nonce', async () => {
    for (const type of ['facebook.data_deletion', 'facebook.deauthorize']) {
      const r = await verify(await ev({ type, sub: '42' }), { kind: 'event', expectNonce: undefined })
      expect(r.ok && r.claims.type).toBe(type)
    }
  })
  it('rejects an unknown type and a lifetime beyond ten minutes', async () => {
    expect((await verify(await ev({ type: 'facebook.other', sub: '42' }), { kind: 'event' })).ok).toBe(false)
    expect((await verify(await ev({ sub: '42' }, { exp: at(900) }), { kind: 'event' })).ok).toBe(false)
  })
})

describe('keys', () => {
  it('an unknown kid refetches exactly once, then fails; a second unknown kid within 30 seconds does not refetch', async () => {
    expect((await verify(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(60) }))).ok).toBe(true)
    expect(jwksFetches()).toBe(1)
    const stranger = await newKey('stranger')
    const t = await b.assertion({ sub: '1', nonce: NONCE }, { key: stranger, iat: at(), exp: at(60) })
    expect((await verify(t)).ok).toBe(false)
    expect(jwksFetches()).toBe(2)
    expect((await verify(t, { now: T0 + 5000 })).ok).toBe(false)
    expect(jwksFetches()).toBe(2)
    expect((await verify(t, { now: T0 + 40_000 })).ok).toBe(false)
    expect(jwksFetches()).toBe(3)
  })
  it('a cold cache fetches once for an unknown kid, not twice', async () => {
    const stranger = await newKey('stranger')
    expect((await verify(await b.assertion({ sub: '1', nonce: NONCE }, { key: stranger, iat: at(), exp: at(60) }))).ok).toBe(false)
    expect(jwksFetches()).toBe(1)
  })
  it('follows a key rotation (two keys, then a new one appears)', async () => {
    expect((await verify(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(60) }))).ok).toBe(true)
    const k2 = await b.addKey('key-2')
    const r = await verify(await b.assertion({ sub: '2', nonce: NONCE }, { key: k2, iat: at(), exp: at(60) }))
    expect(r.ok).toBe(true)
    expect((await verify(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(60) }))).ok).toBe(true)
  })
  it('uses stale keys for up to an hour when the broker is down, then fails closed', async () => {
    const t = await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(60) })
    expect((await verify(t)).ok).toBe(true)
    b.behaviour.jwks = 503
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    // Six minutes later: the cache is stale, the refresh fails, the old keys still verify (the token's own clock is fine too).
    const sixMin = T0 + 6 * 60_000
    const fresh = await b.assertion({ sub: '1', nonce: NONCE }, { iat: Math.floor(sixMin / 1000), exp: Math.floor(sixMin / 1000) + 60 })
    expect((await verify(fresh, { now: sixMin })).ok).toBe(true)
    const late = T0 + 61 * 60_000
    const old = await b.assertion({ sub: '1', nonce: NONCE }, { iat: Math.floor(late / 1000), exp: Math.floor(late / 1000) + 60 })
    expect((await verify(old, { now: late })).ok).toBe(false)
  })
  it('keeps only Ed25519 keys with a kid', () => {
    expect(usableKeys({ keys: [{ kty: 'RSA', kid: 'a', n: 'x', e: 'AQAB' }, { kty: 'OKP', crv: 'Ed25519', x: 'abc', kid: 'ok' }, { kty: 'OKP', crv: 'Ed25519', x: 'abc' }, { kty: 'OKP', crv: 'Ed25519', x: 'abc', kid: 'hs', alg: 'HS256' }] }).map((k) => k.kid)).toEqual(['ok'])
    expect(usableKeys(null)).toEqual([])
  })
  it('refuses a key set body that is too large', async () => {
    const big = vi.fn(async () => new Response('x'.repeat(20_000), { status: 200 }))
    const r = await verify(await b.assertion({ sub: '1', nonce: NONCE }, { iat: at(), exp: at(60) }), { fetch: big })
    expect(r.ok).toBe(false)
  })
})

describe('testConnection', () => {
  const run = (f = b.fetch) => testConnection(CFG, OWN, f)
  it('passes when the broker is healthy, publishes keys and knows the club', async () => {
    const r = await run()
    expect(r.ok).toBe(true)
    expect(r.checks.map((c) => c.name)).toEqual(['health', 'keys', 'registration'])
    expect(b.calls.every((c) => c.startsWith(ORIGIN))).toBe(true)
    const probe = new URL(b.calls.find((c) => c.includes('/v1/facebook/start'))!)
    expect(probe.searchParams.get('return_to')).toBe(`${OWN}/selector/facebook/broker-callback`)
  })
  it('maps 400 and 503 from the registration probe to plain words', async () => {
    b.behaviour.start = 400
    expect((await run()).summary).toMatch(/not registered/)
    b.behaviour.start = 503
    expect((await run()).summary).toMatch(/no Facebook app/)
  })
  it('does not follow the probe redirect (Facebook is never contacted)', async () => {
    const seen: RequestInit[] = []
    const spy = (async (url: string, init?: RequestInit) => {
      seen.push(init ?? {})
      return b.fetch(url, init)
    }) as typeof b.fetch
    await run(spy)
    expect(seen[2].redirect).toBe('manual')
    expect(seen[0].redirect).toBe('error')
  })
  it('reports an unhealthy broker, a timeout, an oversize answer and a keyless broker', async () => {
    b.behaviour.healthBody = { ok: false }
    expect((await run()).checks[0].ok).toBe(false)
    b.behaviour.healthBody = { ok: true }
    b.behaviour.health = 'timeout'
    expect((await run()).checks[0].text).toMatch(/too long/)
    b.behaviour.health = 200
    b.behaviour.jwksBody = { keys: [] }
    expect((await run()).checks[1].ok).toBe(false)
    const huge = vi.fn(async () => new Response('x'.repeat(20_000)))
    expect((await run(huge as never)).checks[0].text).toMatch(/large/)
  })
  it('never echoes headers or bodies into the stored summary', async () => {
    b.behaviour.start = 500
    const r = await run()
    expect(JSON.stringify(r)).not.toMatch(/Location|facebook\.com/)
  })
})
