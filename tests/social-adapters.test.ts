import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredNetworks, getAdapter, unavailableNetworks } from '@/lib/social/adapters'
import { mockAdapter, mockAllowed, mockControl, mockRequestedButRefused } from '@/lib/social/adapters/mock'
import { scrubSecrets, storedReason } from '@/lib/social/adapters/scrub'
import { facebookAdapter, instagramAdapter, xAdapter } from '@/lib/social/adapters/stubs'

const FULL: Record<string, string | undefined> = {
  FACEBOOK_PAGE_ID: '123', FACEBOOK_PAGE_ACCESS_TOKEN: 'fb-token-secret-value', INSTAGRAM_BUSINESS_ACCOUNT_ID: '456', INSTAGRAM_ACCESS_TOKEN: 'ig-token-secret-value',
  X_API_KEY: 'x-key-secret-value', X_API_SECRET: 'x-secret-secret-value', X_ACCESS_TOKEN: 'x-token-secret-value', X_ACCESS_TOKEN_SECRET: 'x-token-secret-2',
}
const input = { postId: 1, network: 'facebook' as const, text: 'hi', imageUrl: 'https://club.example/p.png' }

afterEach(() => { mockControl.reset(); vi.restoreAllMocks() })

describe('the real networks are stubs', () => {
  it('report configured only with their full env, and are never live', () => {
    expect(facebookAdapter.isConfigured({})).toBe(false)
    expect(facebookAdapter.isConfigured({ FACEBOOK_PAGE_ID: '1' })).toBe(false)
    for (const a of [facebookAdapter, instagramAdapter, xAdapter]) {
      expect(a.isConfigured(FULL), a.id).toBe(true)
      expect(a.live, a.id).toBe(false)
    }
  })
  it('are never offered for scheduling, even with full credentials', () => {
    expect(configuredNetworks(FULL).map((a) => a.id)).toEqual([])
    expect(configuredNetworks({ ...FULL, SOCIAL_MOCK_NETWORK: 'yes', NODE_ENV: 'development' }).map((a) => a.id)).toEqual(['mock'])
    expect(unavailableNetworks(FULL).map((a) => a.id)).toEqual(['facebook', 'instagram', 'x'])
  })
  it('getAdapter gives nothing when unset', () => {
    expect(getAdapter('facebook', {})).toBeUndefined()
    expect(getAdapter('x', FULL)?.id).toBe('x')
  })
  it('publish makes no call and answers not_implemented', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    for (const a of [facebookAdapter, instagramAdapter, xAdapter]) {
      const r = await a.publish({ ...input, network: a.id }, new AbortController().signal)
      expect(r).toMatchObject({ ok: false, outcome: 'rejected', retryable: false, code: 'not_implemented' })
    }
    expect(spy).not.toHaveBeenCalled()
  })
  it('state their caption limits', () => {
    expect(xAdapter.limits.maxChars).toBe(280)
    expect(instagramAdapter.limits).toMatchObject({ maxChars: 2200, maxHashtags: 30 })
    expect(facebookAdapter.limits.maxChars).toBe(63206)
  })
})

describe('the Test network', () => {
  it('may run in development and test with the first flag, but in production only with both', () => {
    expect(mockAllowed({ NODE_ENV: 'production', SOCIAL_MOCK_NETWORK: 'yes' })).toBe(false)
    expect(mockAllowed({ NODE_ENV: 'production', SOCIAL_MOCK_NETWORK: 'yes', SOCIAL_MOCK_ALLOW_PROD_DEMO: 'yes' })).toBe(true)
    expect(mockAllowed({ NODE_ENV: 'development', SOCIAL_MOCK_NETWORK: 'yes' })).toBe(true)
    expect(mockAllowed({ NODE_ENV: 'test', SOCIAL_MOCK_NETWORK: 'yes' })).toBe(true)
    expect(mockAllowed({ NODE_ENV: 'development' })).toBe(false)
    expect(mockAllowed({})).toBe(false)
    expect(mockAllowed({ NODE_ENV: 'production', SOCIAL_MOCK_ALLOW_PROD_DEMO: 'yes' })).toBe(false)
  })
  it('makes the server refuse to start when it is requested but not allowed', () => {
    expect(mockRequestedButRefused({ NODE_ENV: 'production', SOCIAL_MOCK_NETWORK: 'yes' })).toBe(true)
    expect(mockRequestedButRefused({ NODE_ENV: 'production', SOCIAL_MOCK_NETWORK: 'yes', SOCIAL_MOCK_ALLOW_PROD_DEMO: 'yes' })).toBe(false)
    expect(mockRequestedButRefused({ NODE_ENV: 'production' })).toBe(false)
  })
  it('honours each scripted outcome and records calls', async () => {
    const sig = new AbortController().signal
    mockControl.queue.push('success', 'retryable', 'rejected', 'unknown')
    expect(await mockAdapter.publish(input, sig)).toMatchObject({ ok: true })
    expect(await mockAdapter.publish(input, sig)).toMatchObject({ ok: false, outcome: 'rejected', retryable: true })
    expect(await mockAdapter.publish(input, sig)).toMatchObject({ ok: false, outcome: 'rejected', retryable: false })
    expect(await mockAdapter.publish(input, sig)).toMatchObject({ ok: false, outcome: 'unknown' })
    mockControl.queue.push('throw')
    await expect(mockAdapter.publish(input, sig)).rejects.toThrow()
    expect(mockControl.calls).toHaveLength(5)
  })
  it('a slow answer ends when the signal aborts', async () => {
    mockControl.queue.push('slow')
    const ctrl = new AbortController()
    const p = mockAdapter.publish(input, ctrl.signal)
    ctrl.abort()
    await expect(p).rejects.toThrow('aborted')
  })
})

describe('scrubSecrets', () => {
  it('removes every configured secret, including URL-encoded forms', () => {
    const env = { ...FULL, CRON_SECRET: 'cron secret/with+chars' }
    const text = `bad ${FULL.FACEBOOK_PAGE_ACCESS_TOKEN} and ${encodeURIComponent('cron secret/with+chars')} and ${FULL.X_API_SECRET} ${FULL.INSTAGRAM_ACCESS_TOKEN}`
    const out = scrubSecrets(text, env)
    for (const v of [FULL.FACEBOOK_PAGE_ACCESS_TOKEN, FULL.X_API_SECRET, FULL.INSTAGRAM_ACCESS_TOKEN, encodeURIComponent('cron secret/with+chars')]) expect(out).not.toContain(v)
    expect(out).toContain('[hidden]')
  })
  it('keeps stored reasons on one line and at most 300 characters', () => {
    const out = storedReason(`a\n\n${'x'.repeat(500)} ${FULL.FACEBOOK_PAGE_ACCESS_TOKEN}`, FULL)
    expect(out.length).toBeLessThanOrEqual(300)
    expect(out).not.toContain('\n')
  })
  it('ignores empty or very short values', () => {
    expect(scrubSecrets('abc', { X_API_KEY: 'abc' })).toBe('abc')
    expect(scrubSecrets('plain', {})).toBe('plain')
  })
})
