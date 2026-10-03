/**
 * event-photos.int (spec §15; replaces events-admin-rsvp-photo-actions). The storage plugin is
 * ENABLED with the fake token (PAYLOAD_BLOB_FAKE=1, @vercel/blob mocked): public submission
 * registers a pending doc on the existing blob (phone-style filename, slugged), duplicate
 * submissions are refused, approve publishes, reject deletes the doc and its blob — except a
 * `legacyUrl` row, and nothing at all under BLOB_DELETE_DISABLED. Also `sortFirst` and the
 * multipart REST create that RecapPhotosField uses.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import config from '@payload-config'
import { handleEndpoints, type Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

const blob = vi.hoisted(() => {
  process.env.PAYLOAD_BLOB_FAKE = '1'
  const { createRequire } = process.getBuiltinModule('node:module') as typeof import('node:module')
  const fromPlugin = createRequire(createRequire(import.meta.url).resolve('@payloadcms/storage-vercel-blob'))
  const put = vi.fn(async (pathname: string) => ({ url: `https://fakestore.public.blob.vercel-storage.com/${pathname}`, pathname }))
  const del = vi.fn(async (url: string | string[]) => void url)
  const head = vi.fn(async (url: string) => ({ url, size: 4321, contentType: 'image/jpeg' }))
  const pluginBlobPath = fromPlugin.resolve('@vercel/blob').replace(/index\.cjs$/, 'index.js')
  return { put, del, head, pluginBlobPath }
})

vi.mock(blob.pluginBlobPath, async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('@vercel/blob', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return { ...actual, nowAsEventClock: () => new Date('2026-10-03T12:00:00.000Z') }
})

const BASE = 'https://fakestore.public.blob.vercel-storage.com'
const ctx = { disableRevalidate: true }
let payload: Payload
let editor: string
let pastEvent: number

beforeAll(async () => {
  payload = await getTestPayload()
  for (const c of ['event-photos', 'event-rsvps', 'events'] as const) await clearCollection(payload, c)
  editor = await tokenFor(payload, 'editor', 'photos-editor@example.com')
  pastEvent = (
    await payload.create({
      collection: 'events',
      data: { type: 'one_time', title: 'Presentation Night', eventDate: '2026-09-12T00:00:00.000Z', eventTime: '18:30' },
      context: ctx,
    })
  ).id
})

afterAll(async () => {
  await destroyTestPayload(payload)
  delete process.env.PAYLOAD_BLOB_FAKE
  delete process.env.BLOB_DELETE_DISABLED
})

beforeEach(() => {
  blob.put.mockClear()
  blob.del.mockClear()
  blob.head.mockClear()
})

const submit = async (fields: Record<string, string>) => {
  const { submitEventPhoto } = await import('@/app/(frontend)/events/[id]/actions')
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return submitEventPhoto(fd)
}

describe('public photo submission → moderation', () => {
  // What the browser uploads for "IMG 1234 (1).JPG": slugged by publicUploadName, random suffix by Blob.
  const url = `${BASE}/events/pending/img-1234-1-Wv9Ut7Sr5Qp3On1Ml9Kj7Ih.jpg`
  let id: number

  it('registers a pending doc on the existing blob (no bytes moved, url round-trips)', async () => {
    const { publicUploadName } = await import('@/lib/blob-client')
    expect(publicUploadName('IMG 1234 (1).JPG')).toBe('img-1234-1.jpg')
    expect(await submit({ eventId: String(pastEvent), url, submitterName: 'Pat Doyle', caption: 'From the back table' })).toBeUndefined()
    const { docs } = await payload.find({ collection: 'event-photos', where: { status: { equals: 'pending' } }, depth: 0 })
    expect(docs).toHaveLength(1)
    id = docs[0].id
    expect(docs[0]).toMatchObject({
      event: pastEvent,
      prefix: 'events/pending',
      filename: 'img-1234-1-Wv9Ut7Sr5Qp3On1Ml9Kj7Ih.jpg',
      filesize: 4321,
      mimeType: 'image/jpeg',
      status: 'pending',
      submitterName: 'Pat Doyle',
      caption: 'From the back table',
      url,
    })
    expect(blob.put).not.toHaveBeenCalled()
  })

  it('a resubmitted URL is refused with a friendly error (unique filename)', async () => {
    expect(await submit({ eventId: String(pastEvent), url })).toEqual({ error: 'This photo has already been sent in. Thanks!' })
    expect(await payload.count({ collection: 'event-photos' })).toEqual({ totalDocs: 1 })
  })

  it('pending photos are invisible anonymously; approving publishes it (blob stays under events/pending/)', async () => {
    expect((await rest('GET', '/event-photos')).json.totalDocs).toBe(0)
    const { getEventPhotosPublic } = await import('@/lib/events-queries')
    expect(await getEventPhotosPublic(pastEvent)).toEqual([])
    const res = await rest('PATCH', `/event-photos/${id}`, { token: editor, body: { status: 'approved' } })
    expect(res.status).toBe(200)
    expect(res.json.doc).toMatchObject({ status: 'approved', prefix: 'events/pending', url })
    expect(await getEventPhotosPublic(pastEvent)).toEqual([{ url }])
    const anon = await rest('GET', '/event-photos')
    expect(anon.json.totalDocs).toBe(1)
    expect(anon.json.docs[0]).not.toHaveProperty('submitterName')
    expect(blob.put).not.toHaveBeenCalled()
    expect(blob.del).not.toHaveBeenCalled()
  })

  it('rejecting deletes the doc and calls del for exactly its blob', async () => {
    expect(await submit({ eventId: String(pastEvent), url: `${BASE}/events/pending/blurry-Kj7Ih5Gf3Ed1.jpg` })).toBeUndefined()
    const { docs } = await payload.find({ collection: 'event-photos', where: { status: { equals: 'pending' } }, depth: 0 })
    expect((await rest('DELETE', `/event-photos/${docs[0].id}`, { token: editor })).status).toBe(200)
    expect(blob.del).toHaveBeenCalledTimes(1)
    expect(blob.del.mock.calls[0][0]).toBe(`${BASE}/events/pending/blurry-Kj7Ih5Gf3Ed1.jpg`)
    expect(await payload.count({ collection: 'event-photos', where: { id: { equals: docs[0].id } } })).toEqual({ totalDocs: 0 })
  })
})

describe('blob delete guards (spec §7.5)', () => {
  it('rejecting a legacyUrl row deletes the doc but never its blob (shared with the rollback target)', async () => {
    const legacyUrl = `${BASE}/events/pending/IMG_1234-legacy.jpg`
    const doc = await payload.create({
      collection: 'event-photos',
      data: { filename: 'IMG_1234-legacy.jpg', prefix: 'events/pending', mimeType: 'image/jpeg', focalX: 50, focalY: 50, event: pastEvent, status: 'pending', legacyUrl },
      context: { etl: true, ...ctx },
    })
    expect(doc.url).toBe(legacyUrl)
    expect((await rest('DELETE', `/event-photos/${doc.id}`, { token: editor })).status).toBe(200)
    expect(blob.del).not.toHaveBeenCalled()
  })

  it('the client-upload route never issues an overwrite receipt for a legacyUrl blob', async () => {
    const issue = (filename: string) =>
      rest('POST', '/vercel-blob-client-upload-route?issue-client-upload=1', {
        body: { collectionSlug: 'event-photos', filename, mimeType: 'image/jpeg', docPrefix: 'events/pending' },
        token: editor,
      })
    const data = { prefix: 'events/pending', mimeType: 'image/jpeg', focalX: 50, focalY: 50, event: pastEvent, status: 'pending' as const }
    await payload.create({ collection: 'event-photos', data: { ...data, filename: 'overwrite-legacy.jpg', legacyUrl: `${BASE}/events/pending/overwrite-legacy.jpg` }, context: { etl: true, ...ctx } })
    await payload.create({ collection: 'event-photos', data: { ...data, filename: 'overwrite-new.jpg' }, context: { etl: true, ...ctx } })

    // Control: the plugin grants an overwrite for a non-legacy row at the same path.
    const control = await issue('overwrite-new.jpg')
    expect(control.status).toBe(200)
    expect(control.json.clientUploadContext.allowOverwrite).toBe(true)

    expect((await issue('overwrite-legacy.jpg')).status).toBe(403)
    process.env.LEGACY_BLOBS_RELEASED = 'yes'
    try {
      expect((await issue('overwrite-legacy.jpg')).status).toBe(200)
    } finally {
      delete process.env.LEGACY_BLOBS_RELEASED
    }
    // A new file name is unaffected (no overwrite involved).
    const fresh = await issue('brand-new.jpg')
    expect(fresh.status).toBe(200)
    expect(fresh.json.clientUploadContext?.allowOverwrite).not.toBe(true)
  })

  it('BLOB_DELETE_DISABLED=1 (Preview) skips every blob delete', async () => {
    process.env.BLOB_DELETE_DISABLED = '1'
    try {
      expect(await submit({ eventId: String(pastEvent), url: `${BASE}/events/pending/preview-only.jpg` })).toBeUndefined()
      const { docs } = await payload.find({ collection: 'event-photos', where: { filename: { equals: 'preview-only.jpg' } }, depth: 0 })
      expect((await rest('DELETE', `/event-photos/${docs[0].id}`, { token: editor })).status).toBe(200)
      expect(blob.del).not.toHaveBeenCalled()
    } finally {
      delete process.env.BLOB_DELETE_DISABLED
    }
  })
})

describe('admin uploads', () => {
  it('sortFirst: a new photo without sortOrder lands in front of the event photos', async () => {
    await clearCollection(payload, 'event-photos')
    const a = await payload.create({ collection: 'event-photos', data: { status: 'approved', event: pastEvent, sortOrder: 3 }, context: ctx })
    const b = await payload.create({ collection: 'event-photos', data: { status: 'approved', event: pastEvent }, context: ctx })
    const c = await payload.create({ collection: 'event-photos', data: { status: 'approved', event: pastEvent }, context: ctx })
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([3, 2, 1])
    // status is required (NOT NULL): it cannot be cleared.
    await expect(payload.update({ collection: 'event-photos', id: a.id, data: { status: null as never }, context: ctx })).rejects.toThrow()
    const etl = await payload.create({ collection: 'event-photos', data: { status: 'approved', event: pastEvent }, context: { etl: true, ...ctx } })
    expect(etl.sortOrder ?? null).toBeNull()
  })

  it('a multipart REST create (RecapPhotosField) stores the file through the plugin and returns the direct URL', async () => {
    const png = readFileSync(path.resolve('public/assets/branding/logo.png'))
    const form = new FormData()
    form.append('file', new File([png], 'recap-1.png', { type: 'image/png' }))
    form.append('_payload', JSON.stringify({ event: pastEvent, status: 'approved' }))
    const request = new Request('http://localhost:3000/api/event-photos', { method: 'POST', headers: { Authorization: `JWT ${editor}` }, body: form })
    const res = await handleEndpoints({ config, request })
    expect(res.status).toBe(201)
    const json = (await res.json()) as { doc: { url: string; status: string; event: number | { id: number }; filename: string } }
    expect(json.doc.status).toBe('approved')
    expect(blob.put).toHaveBeenCalledTimes(1)
    expect(blob.put.mock.calls[0][0]).toBe(`events/${json.doc.filename}`)
    expect(json.doc.url).toBe(`${BASE}/events/${json.doc.filename}`)
  })

  it('anonymous visitors cannot upload or moderate', async () => {
    expect((await rest('POST', '/event-photos', { body: { event: pastEvent } })).status).toBe(403)
    const { docs } = await payload.find({ collection: 'event-photos', limit: 1, depth: 0 })
    expect((await rest('PATCH', `/event-photos/${docs[0].id}`, { body: { status: 'approved' } })).status).toBe(403)
    expect((await rest('DELETE', `/event-photos/${docs[0].id}`)).status).toBe(403)
  })
})
