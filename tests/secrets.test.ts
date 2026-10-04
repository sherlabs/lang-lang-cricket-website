import { describe, expect, it } from 'vitest'
import { clientIp } from '../lib/client-ip'
import { deriveKey, HKDF_LABELS } from '../lib/secrets'

describe('HKDF labels', () => {
  it('are all distinct and each derives a different key', () => {
    const labels = Object.values(HKDF_LABELS)
    expect(new Set(labels).size).toBe(labels.length)
    const keys = labels.map((l) => deriveKey(l, 'a-test-secret-of-some-length-1234567').toString('hex'))
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('depends on the secret and refuses to run without one', () => {
    expect(deriveKey('selector-oauth', 'secret-one-xxxxxxxxxxxxxxxxxxxxxxxx').equals(deriveKey('selector-oauth', 'secret-two-xxxxxxxxxxxxxxxxxxxxxxxx'))).toBe(false)
    expect(() => deriveKey('selector-oauth', '')).toThrow()
  })
})

describe('clientIp', () => {
  const h = (o: Record<string, string>) => new Headers(o)
  it('trusts the Vercel header only on Vercel', () => {
    expect(clientIp(h({ 'x-vercel-forwarded-for': '1.2.3.4' }), { VERCEL: '1' })).toBe('1.2.3.4')
    expect(clientIp(h({ 'x-real-ip': '5.6.7.8' }), { VERCEL: '1' })).toBe('5.6.7.8')
    expect(clientIp(h({ 'x-vercel-forwarded-for': '1.2.3.4' }), {})).toBeNull()
  })
  it('never uses x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9' }), { VERCEL: '1' })).toBeNull()
    expect(clientIp(h({ 'x-forwarded-for': '9.9.9.9' }), {})).toBeNull()
  })
})
