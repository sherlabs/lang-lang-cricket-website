import { describe, expect, it } from 'vitest'
import { SOCIAL_IMAGE_GRACE_MINUTES } from '@/config/site'
import { imagePath, imageServable, mintImageUrl, verifyImageRequest } from '@/lib/social/image-url'

const SECRET = 'a-test-secret-of-some-length-1234567'
const now = new Date('2026-10-12T10:00:00Z')
const parse = (url: string) => {
  const u = new URL(url)
  const [, , , , postId, size] = u.pathname.split('/')
  return { postId, size, rev: u.searchParams.get('rev'), exp: u.searchParams.get('exp'), sig: u.searchParams.get('sig') }
}

describe('signed picture links', () => {
  const url = mintImageUrl('https://club.example/', { postId: 7, size: 'square', revision: 2, now }, SECRET)
  it('round trips', () => {
    expect(url.startsWith('https://club.example/api/social/image/7/square?')).toBe(true)
    expect(verifyImageRequest(parse(url), now, SECRET)).toMatchObject({ postId: 7, size: 'square', revision: 2 })
  })
  it('rejects a tampered post, size, revision, expiry or signature', () => {
    const p = parse(url)
    expect(verifyImageRequest({ ...p, postId: '8' }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, size: 'story' }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, rev: '3' }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, exp: String(Number(p.exp) + 1) }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, sig: p.sig!.replace(/.$/, (c) => (c === '0' ? '1' : '0')) }, now, SECRET)).toBeNull()
    expect(verifyImageRequest(p, now, 'another-secret-of-some-length-12345678')).toBeNull()
  })
  it('expires, and never lasts longer than 24 hours', () => {
    expect(verifyImageRequest(parse(url), new Date(now.getTime() + 25 * 3_600_000), SECRET)).toBeNull()
    const long = mintImageUrl('https://club.example', { postId: 7, size: 'square', revision: 1, now, hours: 500 }, SECRET)
    expect(Number(parse(long).exp) * 1000 - now.getTime()).toBeLessThanOrEqual(24 * 3_600_000)
  })
  it('does not throw on a wrong-length, non-hex or missing signature', () => {
    const p = parse(url)
    for (const sig of ['', 'abc', 'zz'.repeat(32), `${p.sig}00`, null]) expect(verifyImageRequest({ ...p, sig }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, size: 'huge' }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, postId: 'abc' }, now, SECRET)).toBeNull()
    expect(verifyImageRequest({ ...p, exp: null }, now, SECRET)).toBeNull()
  })
  it('verifies from the request alone (it takes no database or post object)', () => {
    expect(verifyImageRequest.length).toBeLessThanOrEqual(3)
    expect(imagePath({ postId: 1, size: 'story', revision: 1, exp: 99999999999 }, SECRET)).toContain('/api/social/image/1/story?rev=1')
  })
})

describe('when a picture may be served', () => {
  const claims = { postId: 1, size: 'square' as const, revision: 2, exp: 0 }
  it('serves scheduled and sending posts', () => {
    expect(imageServable({ status: 'scheduled', revision: 2, finishedAt: null }, claims, now)).toBe(true)
    expect(imageServable({ status: 'publishing', revision: 2, finishedAt: null }, claims, now)).toBe(true)
  })
  it('serves a finished post only inside the grace period', () => {
    const at = (min: number) => new Date(now.getTime() - min * 60_000)
    expect(imageServable({ status: 'published', revision: 2, finishedAt: at(SOCIAL_IMAGE_GRACE_MINUTES - 1) }, claims, now)).toBe(true)
    expect(imageServable({ status: 'failed', revision: 2, finishedAt: at(SOCIAL_IMAGE_GRACE_MINUTES - 1) }, claims, now)).toBe(true)
    expect(imageServable({ status: 'published', revision: 2, finishedAt: at(SOCIAL_IMAGE_GRACE_MINUTES + 1) }, claims, now)).toBe(false)
  })
  it('refuses drafts and a changed revision', () => {
    expect(imageServable({ status: 'draft', revision: 2, finishedAt: null }, claims, now)).toBe(false)
    expect(imageServable({ status: 'scheduled', revision: 3, finishedAt: null }, claims, now)).toBe(false)
  })
})
