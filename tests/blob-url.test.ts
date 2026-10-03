import { describe, expect, it } from 'vitest'
import { blobPathParts, blobStoreId, isOwnBlobUrl } from '@/lib/blob-url'
import { publicUploadName } from '@/lib/blob-client'

const STORE = 'https://fakestore.public.blob.vercel-storage.com'
const ok = (url: string, prefix = 'events/pending', storeId: string | null = 'fakestore') => isOwnBlobUrl(url, { storeId, prefix })

describe('blobStoreId', () => {
  it('extracts and lower-cases the store id from a token', () => {
    expect(blobStoreId('vercel_blob_rw_AbC123_secret')).toBe('abc123')
    expect(blobStoreId('nope')).toBeNull()
    expect(blobStoreId(undefined)).toBeNull()
  })
})

describe('isOwnBlobUrl (spec §6 hardening)', () => {
  it('accepts an https URL on our store, directly under the prefix, with a safe basename', () => {
    expect(ok(`${STORE}/events/pending/img-1234-Ab3De5.jpg`)).toBe(true)
    expect(ok(`${STORE}/stories/pending/cover_1.webp`, 'stories/pending')).toBe(true)
  })

  it('matches a mixed-case store id against the lower-case hostname', () => {
    expect(ok('https://abc123.public.blob.vercel-storage.com/events/pending/a.jpg', 'events/pending', 'AbC123')).toBe(true)
  })

  it.each([
    ['no store id (no token)', `${STORE}/events/pending/a.jpg`, null],
    ['a foreign store', 'https://other.public.blob.vercel-storage.com/events/pending/a.jpg', 'fakestore'],
    ['a look-alike host', 'https://fakestore.public.blob.vercel-storage.com.evil.com/events/pending/a.jpg', 'fakestore'],
    ['http', 'http://fakestore.public.blob.vercel-storage.com/events/pending/a.jpg', 'fakestore'],
    ['a query', `${STORE}/events/pending/a.jpg?x=1`, 'fakestore'],
    ['an empty query', `${STORE}/events/pending/a.jpg?`, 'fakestore'],
    ['a hash', `${STORE}/events/pending/a.jpg#frag`, 'fakestore'],
    ['credentials', 'https://u:p@fakestore.public.blob.vercel-storage.com/events/pending/a.jpg', 'fakestore'],
    ['a port', 'https://fakestore.public.blob.vercel-storage.com:8443/events/pending/a.jpg', 'fakestore'],
    ['another prefix', `${STORE}/gallery/a.jpg`, 'fakestore'],
    ['the parent prefix', `${STORE}/events/a.jpg`, 'fakestore'],
    ['a prefix look-alike', `${STORE}/events/pendingx/a.jpg`, 'fakestore'],
    ['a nested folder', `${STORE}/events/pending/sub/a.jpg`, 'fakestore'],
    ['dot-dot', `${STORE}/events/pending/../../gallery/a.jpg`, 'fakestore'],
    ['encoded dot-dot', `${STORE}/events/pending/%2e%2e/a.jpg`, 'fakestore'],
    ['an encoded slash', `${STORE}/events/pending/a%2Fb.jpg`, 'fakestore'],
    ['spaces', `${STORE}/events/pending/IMG%201234.jpg`, 'fakestore'],
    ['an empty basename', `${STORE}/events/pending/`, 'fakestore'],
    ['not a URL', 'events/pending/a.jpg', 'fakestore'],
  ])('rejects %s', (_label, url, storeId) => {
    expect(ok(url, 'events/pending', storeId)).toBe(false)
  })
})

describe('blobPathParts', () => {
  it('splits prefix and decoded filename', () => {
    expect(blobPathParts(`${STORE}/events/pending/a-b.jpg`)).toEqual({ prefix: 'events/pending', filename: 'a-b.jpg' })
    expect(blobPathParts(`${STORE}/x.jpg`)).toEqual({ prefix: '', filename: 'x.jpg' })
  })
})

describe('publicUploadName (phone filenames pass isOwnBlobUrl after upload)', () => {
  it('slugs the basename and keeps a clean extension', () => {
    expect(publicUploadName('IMG 1234 (1).JPG')).toBe('img-1234-1.jpg')
    expect(publicUploadName('Família dinner!.jpeg')).toBe('familia-dinner.jpeg')
    expect(publicUploadName('😀.png')).toBe('image.png')
    expect(publicUploadName('noext')).toBe('noext')
    expect(publicUploadName('.jpg')).toBe('jpg')
    for (const n of ['IMG 1234 (1).JPG', '😀.png', 'a.b.c.webp']) {
      expect(ok(`${STORE}/events/pending/${publicUploadName(n)}`)).toBe(true)
    }
  })
})
