import { randomBytes } from 'node:crypto'
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose'
import type { FetchLike } from '../../lib/facebook-login'

/**
 * A pretend shared sign-in broker for tests and for `pnpm dev:fake-broker` (wave F spec 3.6). It owns a local Ed25519 key pair,
 * publishes it as a JWKS, signs assertions and events like the real broker's protocol v1, and answers `/healthz`, the JWKS and the
 * start route through an injected `fetch`. Nothing here touches a network.
 */
export type FakeKey = { kid: string; privateKey: KeyLike; jwk: JWK }

export async function newKey(kid: string = `k-${randomBytes(4).toString('hex')}`): Promise<FakeKey> {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA', use: 'sig' }
  return { kid, privateKey, jwk }
}

export type FakeBrokerOptions = { origin: string; clubId: string; ownOrigin: string }
export const jtiOf = (): string => randomBytes(16).toString('base64url')

export async function createFakeBroker(o: FakeBrokerOptions) {
  const keys: FakeKey[] = [await newKey('key-1')]
  const calls: string[] = []
  const behaviour = { health: 200 as number | 'timeout', jwks: 200 as number, start: 302 as number, healthBody: { ok: true, facebookConfigured: true, clubs: 1, keys: 1 } as unknown, jwksBody: null as unknown }
  const now = () => Math.floor(Date.now() / 1000)

  const sign = async (claims: Record<string, unknown>, opts: { key?: FakeKey; alg?: string; iss?: string; aud?: string; iat?: number; exp?: number } = {}): Promise<string> => {
    const key = opts.key ?? keys[0]
    const iat = opts.iat ?? now()
    const jwt = new SignJWT({ ...claims })
      .setProtectedHeader({ alg: (opts.alg ?? 'EdDSA') as 'EdDSA', kid: key.kid })
      .setIssuer(opts.iss ?? o.origin)
      .setAudience(opts.aud ?? o.ownOrigin)
      .setIssuedAt(iat)
      .setExpirationTime(opts.exp ?? iat + 60)
    return jwt.sign(key.privateKey)
  }

  const assertion = (a: { sub: string; nonce: string; club?: string; jti?: string; amr?: string[] }, opts: Parameters<typeof sign>[1] = {}) =>
    sign({ sub: a.sub, name: 'Someone', club: a.club ?? o.clubId, nonce: a.nonce, amr: a.amr ?? ['facebook'], jti: a.jti ?? jtiOf() }, opts)

  const event = (e: { type?: string; sub: string; jti?: string }, opts: Parameters<typeof sign>[1] = {}) =>
    sign({ type: e.type ?? 'facebook.data_deletion', sub: e.sub, jti: e.jti ?? jtiOf() }, { exp: now() + 300, ...opts })

  const fetchImpl: FetchLike = async (input) => {
    calls.push(input)
    const url = new URL(input)
    if (url.origin !== o.origin) throw new Error(`fake broker: unexpected host ${url.origin}`)
    if (url.pathname === '/healthz') {
      if (behaviour.health === 'timeout') throw Object.assign(new Error('timed out'), { name: 'TimeoutError' })
      return Response.json(behaviour.healthBody, { status: behaviour.health })
    }
    if (url.pathname === '/.well-known/jwks.json') {
      return Response.json(behaviour.jwksBody ?? { keys: keys.map((k) => k.jwk) }, { status: behaviour.jwks })
    }
    if (url.pathname === '/v1/facebook/start') {
      if (behaviour.start >= 300 && behaviour.start < 400) return new Response(null, { status: behaviour.start, headers: { Location: 'https://www.facebook.com/dialog/oauth' } })
      return new Response('no', { status: behaviour.start })
    }
    return new Response('not found', { status: 404 })
  }

  return { ...o, keys, calls, behaviour, sign, assertion, event, fetch: fetchImpl, addKey: async (kid: string) => { const k = await newKey(kid); keys.unshift(k); return k }, dropKey: (kid: string) => { const i = keys.findIndex((k) => k.kid === kid); if (i >= 0) keys.splice(i, 1) } }
}
export type FakeBroker = Awaited<ReturnType<typeof createFakeBroker>>
