import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { FACEBOOK_GRAPH_VERSION } from '../config/site'
import { dialogUrl, exchangeCode, facebookConfig, fetchProfile, hostSupportsFacebook, looksLikeInAppBrowser, redirectUri, verifySignedRequest } from '../lib/facebook-login'

const cfg = { appId: '123', appSecret: 's3cret', graphVersion: 'v25.0' }

describe('facebookConfig', () => {
  it('is off unless both id and secret are set', () => {
    expect(facebookConfig({})).toBeNull()
    expect(facebookConfig({ FACEBOOK_APP_ID: '1' })).toBeNull()
    expect(facebookConfig({ FACEBOOK_APP_SECRET: 's' })).toBeNull()
    expect(facebookConfig({ FACEBOOK_APP_ID: ' ', FACEBOOK_APP_SECRET: 's' })).toBeNull()
  })
  it('uses the default Graph version unless overridden', () => {
    expect(facebookConfig({ FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's' })?.graphVersion).toBe(FACEBOOK_GRAPH_VERSION)
    expect(facebookConfig({ FACEBOOK_APP_ID: '1', FACEBOOK_APP_SECRET: 's', FACEBOOK_GRAPH_VERSION: 'v99.0' })?.graphVersion).toBe('v99.0')
  })
})

describe('redirect URI and host', () => {
  it('is the callback on the server origin', () => {
    expect(redirectUri('https://club.example')).toBe('https://club.example/selector/facebook/callback')
    expect(redirectUri('https://club.example/')).toBe('https://club.example/selector/facebook/callback')
  })
  it('only the registered host supports Facebook', () => {
    expect(hostSupportsFacebook('https://club.example', 'club.example')).toBe(true)
    expect(hostSupportsFacebook('https://club.example', 'CLUB.example')).toBe(true)
    expect(hostSupportsFacebook('https://club.example', 'preview-abc.vercel.app')).toBe(false)
    expect(hostSupportsFacebook('https://club.example', null)).toBe(false)
    expect(hostSupportsFacebook('not a url', 'x')).toBe(false)
  })
})

describe('dialogUrl', () => {
  it('asks for public_profile only and sends no PKCE parameters', () => {
    const u = new URL(dialogUrl(cfg, { redirectUri: 'https://club.example/selector/facebook/callback', state: 'st' }))
    expect(u.origin + u.pathname).toBe('https://www.facebook.com/v25.0/dialog/oauth')
    expect(u.searchParams.get('scope')).toBe('public_profile')
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(u.searchParams.get('client_id')).toBe('123')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.has('code_challenge')).toBe(false)
    expect(u.searchParams.has('code_challenge_method')).toBe(false)
    expect(u.toString()).not.toContain('s3cret')
  })
})

describe('Graph calls (injected fetch)', () => {
  it('exchanges the code with a POST body (secret never in the URL) and reads the profile with a Bearer header', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return url.includes('/oauth/access_token') ? Response.json({ access_token: 'AT' }) : Response.json({ id: '1234567890', name: 'Sam' })
    })
    const token = await exchangeCode(cfg, { code: 'C', redirectUri: 'https://x/cb' }, fetchImpl)
    expect(token).toBe('AT')
    expect(calls[0].url).not.toContain('s3cret')
    expect(String(calls[0].init?.body)).toContain('client_secret=s3cret')
    const profile = await fetchProfile(cfg, token, fetchImpl)
    expect(profile).toEqual({ id: '1234567890', name: 'Sam' })
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer AT')
    expect(calls[1].url).not.toContain('AT')
  })
  it('throws on errors and on a profile with no numeric id', async () => {
    await expect(exchangeCode(cfg, { code: 'C', redirectUri: 'x' }, async () => new Response('no', { status: 400 }))).rejects.toThrow()
    await expect(exchangeCode(cfg, { code: 'C', redirectUri: 'x' }, async () => Response.json({}))).rejects.toThrow()
    await expect(fetchProfile(cfg, 'AT', async () => Response.json({ id: 'abc' }))).rejects.toThrow()
    await expect(fetchProfile(cfg, 'AT', async () => Response.json({}, { status: 500 }))).rejects.toThrow()
  })
})

describe('signed_request', () => {
  const sign = (obj: unknown, secret = 's3cret') => {
    const payload = Buffer.from(JSON.stringify(obj)).toString('base64url')
    return `${createHmac('sha256', secret).update(payload).digest('base64url')}.${payload}`
  }
  it('accepts a good signature', () => {
    expect(verifySignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '42' }), 's3cret')).toBe('42')
  })
  it('rejects a bad signature, tampering, another secret, a wrong algorithm and junk', () => {
    const good = sign({ algorithm: 'HMAC-SHA256', user_id: '42' })
    const [sig] = good.split('.')
    const forged = `${sig}.${Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '43' })).toString('base64url')}`
    expect(verifySignedRequest(forged, 's3cret')).toBeNull()
    expect(verifySignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '42' }, 'other'), 's3cret')).toBeNull()
    expect(verifySignedRequest(sign({ algorithm: 'none', user_id: '42' }), 's3cret')).toBeNull()
    expect(verifySignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: 'abc' }), 's3cret')).toBeNull()
    for (const junk of [undefined, null, '', 'a', 'a.b.c', 5, {}]) expect(verifySignedRequest(junk, 's3cret')).toBeNull()
  })
})

describe('in-app browsers', () => {
  it('recognises Facebook, Messenger and WhatsApp', () => {
    expect(looksLikeInAppBrowser('Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/400]')).toBe(true)
    expect(looksLikeInAppBrowser('Mozilla/5.0 Messenger')).toBe(true)
    expect(looksLikeInAppBrowser('WhatsApp/2.23')).toBe(true)
    expect(looksLikeInAppBrowser('Mozilla/5.0 (iPhone) Safari/604.1')).toBe(false)
    expect(looksLikeInAppBrowser(null)).toBe(false)
  })
})
