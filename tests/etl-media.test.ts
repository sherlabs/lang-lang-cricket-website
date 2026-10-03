import { describe, expect, it } from 'vitest'
import { classify, isUnderPrefix, mimeFromName, storeIdFromToken } from '@/payload/scripts/etl/media'
import { parseLegacyTimestamp } from '@/payload/scripts/etl/source'

const BASE = 'https://fakestore.public.blob.vercel-storage.com'

describe('ETL media classify (spec §12.4)', () => {
  it('empty', () => {
    expect(classify('', 'fakestore')).toEqual({ kind: 'empty' })
    expect(classify(null, 'fakestore')).toEqual({ kind: 'empty' })
  })
  it('own-blob: prefix = dirname, filename = decoded basename', () => {
    expect(classify(`${BASE}/stories/pending/IMG%201234%20(1)-abc.jpg`, 'fakestore')).toEqual({
      kind: 'own-blob',
      prefix: 'stories/pending',
      filename: 'IMG 1234 (1)-abc.jpg',
      pathname: 'stories/pending/IMG%201234%20(1)-abc.jpg',
    })
    expect(classify(`${BASE}/root.png`, 'fakestore')).toMatchObject({ kind: 'own-blob', prefix: '', filename: 'root.png' })
  })
  it('another store, a query string, or no store id is "other"', () => {
    expect(classify('https://otherstore.public.blob.vercel-storage.com/a/b.jpg', 'fakestore')).toEqual({ kind: 'other' })
    expect(classify(`${BASE}/a/b.jpg?x=1`, 'fakestore')).toEqual({ kind: 'other' })
    expect(classify(`${BASE}/a/b.jpg`, null)).toEqual({ kind: 'other' })
    expect(classify('http://example.com/x.jpg', 'fakestore')).toEqual({ kind: 'other' })
    expect(classify('data:image/png;base64,AAAA', 'fakestore')).toEqual({ kind: 'other' })
  })
  it('local assets', () => {
    expect(classify('/assets/sponsors/a%20b.webp', 'fakestore')).toEqual({ kind: 'local-asset', file: '/assets/sponsors/a b.webp' })
  })
  it('prefix containment, mime types, store id', () => {
    expect(isUnderPrefix('documents', 'documents')).toBe(true)
    expect(isUnderPrefix('documents/2025', 'documents')).toBe(true)
    expect(isUnderPrefix('misc', 'documents')).toBe(false)
    expect(isUnderPrefix('documentsX', 'documents')).toBe(false)
    expect(isUnderPrefix('anything', '')).toBe(true)
    expect(mimeFromName('x.PDF')).toBe('application/pdf')
    expect(mimeFromName('x.webp')).toBe('image/webp')
    expect(storeIdFromToken('vercel_blob_rw_AbC123_secret')).toBe('abc123')
    expect(storeIdFromToken(undefined)).toBeNull()
  })
})

describe('legacy timestamp parsing (spec §12.1)', () => {
  it('reads timestamp-without-time-zone as UTC and truncates to milliseconds', () => {
    expect(parseLegacyTimestamp('2026-09-12 18:30:00').toISOString()).toBe('2026-09-12T18:30:00.000Z')
    expect(parseLegacyTimestamp('2026-09-12 18:30:00.123456').toISOString()).toBe('2026-09-12T18:30:00.123Z')
  })
})
