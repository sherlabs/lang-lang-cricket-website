/**
 * media-register.int (spec §15, §7.4, §12.4): the ETL's register recipe with the storage plugin
 * ENABLED (PAYLOAD_BLOB_FAKE=1, @vercel/blob mocked). For every legacy prefix the stored `prefix`
 * round-trips unchanged, the plugin-equivalent URL equals `legacyUrl`, no bytes are fetched or
 * put, and deleting a `legacyUrl` row never calls `del`.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'

const blob = vi.hoisted(() => {
  process.env.PAYLOAD_BLOB_FAKE = '1'
  const { createRequire } = process.getBuiltinModule('node:module') as typeof import('node:module')
  const fromPlugin = createRequire(createRequire(import.meta.url).resolve('@payloadcms/storage-vercel-blob'))
  const put = vi.fn(async (pathname: string) => ({ url: `https://fakestore.public.blob.vercel-storage.com/${pathname}`, pathname }))
  const del = vi.fn(async (url: string | string[]) => void url)
  const head = vi.fn(async (url: string) => ({ url, size: 1234, contentType: url.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg' }))
  const pluginBlobPath = fromPlugin.resolve('@vercel/blob').replace(/index\.cjs$/, 'index.js')
  return { put, del, head, pluginBlobPath }
})

// The plugin's own pinned @vercel/blob, and the app's (used by the ETL's head()).
vi.mock(blob.pluginBlobPath, async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('@vercel/blob', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))

const BASE = 'https://fakestore.public.blob.vercel-storage.com'

// generateURL is not exported from the package entry; load the plugin's own module.
const pluginDist = path.dirname(createRequire(import.meta.url).resolve('@payloadcms/storage-vercel-blob'))
type GenerateURL = (a: { baseUrl: string; collectionPrefix?: string; filename: string; prefix?: string }) => string

let payload: Payload
let generateURL: GenerateURL
const fetchSpy = vi.fn()

beforeAll(async () => {
  payload = await getTestPayload()
  ;({ generateURL } = (await import(path.join(pluginDist, 'generateURL.js'))) as { generateURL: GenerateURL })
  for (const c of ['media', 'documents', 'gallery-photos'] as const) await clearCollection(payload, c)
  vi.stubGlobal('fetch', fetchSpy)
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await destroyTestPayload(payload)
  delete process.env.PAYLOAD_BLOB_FAKE
})

beforeEach(() => {
  blob.put.mockClear()
  blob.del.mockClear()
  fetchSpy.mockClear()
})

async function etlContext() {
  const { EtlReport } = await import('@/payload/scripts/etl/report')
  const { FAKE_BLOB_TOKEN } = await import('@/payload/env')
  return {
    payload,
    source: {} as never,
    report: new EtlReport(false),
    dryRun: false,
    update: false,
    storeId: 'fakestore',
    token: FAKE_BLOB_TOKEN,
    publicDir: path.resolve('public'),
  }
}

const CASES = [
  { collection: 'media', prefix: 'players', filename: 'jo-bloggs-Ab3De5Fg7Hi9Jk1Lm3No5Pq.jpg' },
  { collection: 'media', prefix: 'contacts', filename: 'alex-turner-Pq5No3Lm1Kj9Ih7Gf5Ed3Cb.jpg' },
  { collection: 'media', prefix: 'sponsors', filename: 'harbour-plumbing-Kd8WcZs1Qx7Lm2Pa9RtYb3.png' },
  { collection: 'media', prefix: 'stories', filename: 'cover-Zy8Xw6Vu4Ts2Rq0Po8Nm6Lk.jpg' },
  { collection: 'media', prefix: 'stories/pending', filename: 'IMG 1234 (1)-Wv9Ut7Sr5Qp3On1Ml9Kj7Ih.jpg' },
  { collection: 'media', prefix: 'events', filename: 'presentation-night-Gf5Ed3Cb1Az9Yx7Wv5Ut3Sr.jpg' },
  { collection: 'documents', prefix: 'documents', filename: 'ccca-directory-25-26.pdf', extra: { title: 'Directory', category: 'CCCA Directory' } },
  { collection: 'gallery-photos', prefix: 'gallery', filename: 'team-photo-Ab3De5Fg7Hi9Jk1Lm3No5Pq.jpg', extra: { caption: '', sortOrder: 0 } },
] as const

const COLLECTION_PREFIX = { media: '', documents: 'documents', 'gallery-photos': 'gallery' } as const

describe('registering existing blobs (ETL, plugin enabled)', () => {
  for (const c of CASES) {
    it(`${c.collection}: ${c.prefix}/${c.filename}`, async () => {
      const { importFile } = await import('@/payload/scripts/etl/media')
      const legacyUrl = `${BASE}/${c.prefix}/${encodeURIComponent(c.filename)}`
      const ctx = await etlContext()
      const res = await importFile(ctx, {
        collection: c.collection,
        url: legacyUrl,
        data: 'extra' in c ? { ...c.extra } : { alt: '' },
        relation: c.collection === 'media',
        where: { step: 'test', table: 't', id: 1, field: 'url' },
      })
      expect(res.action).toBe('register')
      const doc = (await payload.findByID({ collection: c.collection, id: res.id!, depth: 0 })) as unknown as Record<string, unknown>
      expect(doc.prefix).toBe(c.prefix)
      expect(doc.filename).toBe(c.filename)
      expect(doc.filesize).toBe(1234)
      expect(doc.legacyUrl).toBe(legacyUrl)
      expect(doc.url).toBe(legacyUrl)
      // The URL the plugin itself generates from the stored row (no legacyUrl read rule involved).
      expect(generateURL({ baseUrl: BASE, collectionPrefix: COLLECTION_PREFIX[c.collection], filename: doc.filename as string, prefix: doc.prefix as string })).toBe(legacyUrl)
      expect(blob.put).not.toHaveBeenCalled()
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(ctx.report.items).toEqual([])
    })
  }

  it('re-importing the same URL reuses the media doc (legacyUrl dedupe)', async () => {
    const { importFile } = await import('@/payload/scripts/etl/media')
    const legacyUrl = `${BASE}/players/${CASES[0].filename}`
    const ctx = await etlContext()
    const res = await importFile(ctx, { collection: 'media', url: legacyUrl, data: { alt: '' }, relation: true, where: { step: 't', table: 't', id: 2, field: 'x' } })
    expect(res.action).toBe('reused')
    expect(await payload.count({ collection: 'media', where: { legacyUrl: { equals: legacyUrl } } })).toEqual({ totalDocs: 1 })
  })

  it('deleting a legacyUrl row never deletes the blob', async () => {
    const { docs } = await payload.find({ collection: 'media', where: { prefix: { equals: 'contacts' } }, limit: 1 })
    await payload.delete({ collection: 'media', id: docs[0].id, context: { disableRevalidate: true } })
    const g = await payload.find({ collection: 'gallery-photos', limit: 1 })
    await payload.delete({ collection: 'gallery-photos', id: g.docs[0].id, context: { disableRevalidate: true } })
    expect(blob.del).not.toHaveBeenCalled()
  })

  it('a filename collision under a token falls back to download + re-upload (renamed), and is reported', async () => {
    const { readFileSync } = await import('node:fs')
    const { importFile } = await import('@/payload/scripts/etl/media')
    const png = readFileSync(path.resolve('public/assets/branding/logo.png'))
    fetchSpy.mockResolvedValueOnce(new Response(png, { status: 200 }))
    const ctx = await etlContext()
    const legacyUrl = `${BASE}/events/${CASES[2].filename}` // same basename as the sponsors/ row
    const res = await importFile(ctx, { collection: 'media', url: legacyUrl, data: { alt: '' }, relation: true, where: { step: 't', table: 't', id: 3, field: 'x' } })
    expect(res.action).toBe('fallback-reupload')
    expect(ctx.report.items.map((i) => i.kind)).toEqual(['media-fallback-reupload'])
    expect(fetchSpy).toHaveBeenCalledWith(legacyUrl)
    expect(blob.put).toHaveBeenCalledTimes(1)
    const doc = await payload.findByID({ collection: 'media', id: res.id!, depth: 0 })
    expect(doc.filename).not.toBe(CASES[2].filename)
    expect(doc.legacyUrl).toBe(legacyUrl)
  })
})
