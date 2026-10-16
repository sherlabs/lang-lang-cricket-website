import { describe, expect, it } from 'vitest'
import { clientIp, ipSourceConfigured } from '../lib/client-ip'

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

describe('clientIp', () => {
  it('trusts nothing off Vercel unless a header is named', () => {
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '1.2.3.4' }), {})).toBeNull()
    expect(ipSourceConfigured({})).toBe(false)
  })
  it('reads only the configured header off Vercel', () => {
    const env = { TRUSTED_IP_HEADER: 'CF-Connecting-IP' }
    expect(clientIp(h({ 'cf-connecting-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4' }), env)).toBe('9.9.9.9')
    expect(clientIp(h({ 'x-forwarded-for': '1.2.3.4' }), env)).toBeNull()
    expect(ipSourceConfigured(env)).toBe(true)
  })
  it('uses the Vercel header on Vercel', () => {
    expect(clientIp(h({ 'x-vercel-forwarded-for': '5.5.5.5, 6.6.6.6' }), { VERCEL: '1' })).toBe('5.5.5.5')
    expect(ipSourceConfigured({ VERCEL: '1' })).toBe(true)
  })
})
