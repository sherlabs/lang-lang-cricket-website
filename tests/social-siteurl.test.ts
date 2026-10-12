import { describe, expect, it } from 'vitest'
import { isPublicHttpsUrl } from '@/lib/social/site-url'

describe('public https site address', () => {
  it('accepts a public https address', () => {
    expect(isPublicHttpsUrl('https://club.example')).toBe(true)
    expect(isPublicHttpsUrl('https://www.club.example/')).toBe(true)
    expect(isPublicHttpsUrl('https://8.8.8.8')).toBe(true)
  })
  it('rejects http, localhost, loopback and private addresses', () => {
    for (const u of ['http://club.example', 'https://localhost', 'https://localhost:3000', 'https://127.0.0.1', 'https://10.0.0.5', 'https://192.168.1.4', 'https://172.16.0.1', 'https://169.254.1.1', 'https://[::1]', 'https://club.local', 'https://intranet', 'ftp://club.example', 'not a url', '', 'https://user:pw@club.example']) {
      expect(isPublicHttpsUrl(u), u).toBe(false)
    }
    expect(isPublicHttpsUrl(null)).toBe(false)
    expect(isPublicHttpsUrl(undefined)).toBe(false)
  })
  it('allows the local override only outside production', () => {
    expect(isPublicHttpsUrl('http://localhost:3000', { SOCIAL_ALLOW_LOCAL_SITE_URL: 'yes', NODE_ENV: 'development' })).toBe(true)
    expect(isPublicHttpsUrl('http://localhost:3000', { SOCIAL_ALLOW_LOCAL_SITE_URL: 'yes', NODE_ENV: 'production' })).toBe(false)
    expect(isPublicHttpsUrl('http://localhost:3000', { NODE_ENV: 'development' })).toBe(false)
  })
})
