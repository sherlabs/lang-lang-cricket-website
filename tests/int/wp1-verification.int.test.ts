/**
 * WP1 verification items (spec §7.6 and §18 WP1 "Recorded verification results").
 * Runs the real storage plugin with the fake token (PAYLOAD_BLOB_FAKE=1) and a
 * mocked @vercel/blob, against a probe config in schema `probe` of the test DB.
 * Results are recorded in the spec's "WP1 findings" section.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import { handleEndpoints } from 'payload'
import { destroyTestPayload } from './helpers'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const blob = vi.hoisted(() => {
  process.env.PAYLOAD_BLOB_FAKE = '1'
  const { createRequire } = process.getBuiltinModule('node:module') as typeof import('node:module')
  // The plugin pins its own @vercel/blob (2.3.1); mock that exact module file.
  const fromPlugin = createRequire(createRequire(import.meta.url).resolve('@payloadcms/storage-vercel-blob'))
  const put = vi.fn(async (pathname: string, body: Buffer | Uint8Array) => ({
    url: `https://fakestore.public.blob.vercel-storage.com/${pathname}`,
    downloadUrl: '',
    pathname,
    contentType: 'image/png',
    contentDisposition: '',
    size: body?.length ?? 0,
  }))
  const del = vi.fn(async (_url: string | string[]) => undefined)
  const head = vi.fn(async () => {
    throw new Error('head() should not be called in these tests')
  })
    // require.resolve gives the CJS entry; the plugin's ESM import loads dist/index.js.
  const pluginBlobPath = fromPlugin.resolve('@vercel/blob').replace(/index\.cjs$/, 'index.js')
  return { put, del, head, pluginBlobPath }
})

vi.mock(blob.pluginBlobPath, async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  put: blob.put,
  del: blob.del,
  head: blob.head,
}))

const PNG = readFileSync(path.resolve('public/assets/branding/logo.png')) // 161x202

// The probe config's collections are not in payload-types.ts, so the instance is untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let payload: any
let config: Awaited<typeof import('./probe.config').default>

beforeAll(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URI })
  await c.connect()
  await c.query('DROP SCHEMA IF EXISTS probe CASCADE')
  await c.query('CREATE SCHEMA probe')
  await c.end()
  const { getPayload } = await import('payload')
  config = await (await import('./probe.config')).default
  payload = await getPayload({ config })
})

afterAll(async () => {
  await destroyTestPayload(payload)
})

beforeEach(() => {
  blob.put.mockClear()
  blob.del.mockClear()
  delete process.env.BLOB_DELETE_DISABLED
})

async function adminToken(): Promise<string> {
  const email = 'probe-admin@example.com'
  const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
  if (!found.docs.length) {
    await payload.create({ collection: 'users', data: { email, password: 'probe-pass-123', role: 'admin' }, context: { seedAdmin: true } })
  }
  const res = await payload.login({ collection: 'users', data: { email, password: 'probe-pass-123' } })
  return res.token!
}

describe('7.6(a) resizeOptions under clientUploads', () => {
  it('a client-uploaded file IS re-stored resized when the collection has resizeOptions', async () => {
    const doc = await payload.create({
      collection: 'resize-probe',
      data: {},
      file: {
        data: PNG,
        mimetype: 'image/png',
        name: 'client-probe.png',
        size: PNG.length,
        // What getFileFromClientUpload attaches for a browser-direct upload.
        clientUploadContext: { pathname: 'probe/client-probe.png' },
      } as never,
    })
    expect(doc.width).toBeLessThanOrEqual(40)
    expect(doc.height).toBeLessThanOrEqual(40)
    // Record what the plugin did: generateFileData deletes clientUploadContext after
    // sharp processing, so the plugin's afterChange no longer skips the file.
    expect(blob.put).toHaveBeenCalledTimes(1)
    const [pathname, body] = blob.put.mock.calls[0]
    expect(pathname).toBe('probe/client-probe.png')
    expect((body as Buffer).length).toBeLessThan(PNG.length)
  })

  it('without resizeOptions a client-uploaded file is NOT re-uploaded', async () => {
    await payload.create({
      collection: 'plain-probe',
      data: {},
      file: {
        data: PNG,
        mimetype: 'image/png',
        name: 'client-media.png',
        size: PNG.length,
        clientUploadContext: { pathname: 'plain/client-media.png' },
      } as never,
    })
    expect(blob.put).not.toHaveBeenCalled()
  })
})

describe('7.6(b) delete of a registered media row (collection prefix "")', () => {
  const register = (filename: string, legacyUrl?: string) =>
    payload.create({
      collection: 'media',
      data: { filename, prefix: 'players', mimeType: 'image/jpeg', filesize: 10, focalX: 50, focalY: 50, alt: '', legacyUrl },
      context: { etl: true, disableRevalidate: true },
    })

  it('stores the per-row prefix verbatim and builds the URL from it', async () => {
    const doc = await register('reg-a-Xy12.jpg')
    expect(doc.prefix).toBe('players')
    expect(doc.url).toBe('https://fakestore.public.blob.vercel-storage.com/players/reg-a-Xy12.jpg')
  })

  it('deletes exactly prefix/filename for a non-legacy row', async () => {
    const doc = await register('reg-b-Xy12.jpg')
    await payload.delete({ collection: 'media', id: doc.id })
    expect(blob.del).toHaveBeenCalledTimes(1)
    expect(String(blob.del.mock.calls[0][0])).toBe('https://fakestore.public.blob.vercel-storage.com/players/reg-b-Xy12.jpg')
  })

  it('skips the blob delete for a legacyUrl row (guardLegacyBlobDeletes)', async () => {
    const legacyUrl = 'https://fakestore.public.blob.vercel-storage.com/players/reg-c-Xy12.jpg'
    const doc = await register('reg-c-Xy12.jpg', legacyUrl)
    expect(doc.url).toBe(legacyUrl)
    await payload.delete({ collection: 'media', id: doc.id })
    expect(blob.del).not.toHaveBeenCalled()
  })

  it('skips every blob delete when BLOB_DELETE_DISABLED=1', async () => {
    const doc = await register('reg-d-Xy12.jpg')
    process.env.BLOB_DELETE_DISABLED = '1'
    await payload.delete({ collection: 'media', id: doc.id })
    expect(blob.del).not.toHaveBeenCalled()
  })

  it('refuses replacing the file of a legacyUrl row', async () => {
    const doc = await register('reg-e-Xy12.jpg', 'https://fakestore.public.blob.vercel-storage.com/players/reg-e-Xy12.jpg')
    await expect(
      payload.update({
        collection: 'media',
        id: doc.id,
        data: {},
        file: { data: PNG, mimetype: 'image/png', name: 'replacement.png', size: PNG.length },
      }),
    ).rejects.toThrow(/cannot be replaced/)
  })
})

describe('media resizeOptions (enabled because of 7.6(a))', () => {
  it('a client upload larger than 2000px is re-stored at most 2000px on the long edge', async () => {
    const sharp = (await import('sharp')).default
    const big = await sharp({ create: { width: 2600, height: 1300, channels: 3, background: '#F5B700' } }).jpeg().toBuffer()
    const doc = await payload.create({
      collection: 'media',
      data: { alt: '' },
      file: { data: big, mimetype: 'image/jpeg', name: 'big.jpg', size: big.length, clientUploadContext: { pathname: 'big.jpg' } } as never,
    })
    expect(doc.width).toBe(2000)
    expect(doc.height).toBe(1000)
    expect(blob.put).toHaveBeenCalledTimes(1)
    expect(blob.put.mock.calls[0][0]).toBe('big.jpg')
  })
})

describe('7.6(c) REST multipart create under clientUploads: true', () => {
  it('a server-side multipart POST stores the file through the plugin', async () => {
    const token = await adminToken()
    const form = new FormData()
    form.append('file', new Blob([PNG], { type: 'image/png' }), 'rest-probe.png')
    form.append('_payload', JSON.stringify({ alt: 'rest' }))
    const request = new Request('http://localhost:3000/api/media', {
      method: 'POST',
      headers: { Authorization: `JWT ${token}` },
      body: form,
    })
    const res = await handleEndpoints({ config, request })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.doc.filename).toBe('rest-probe.png')
    expect(blob.put).toHaveBeenCalledTimes(1)
    expect(blob.put.mock.calls[0][0]).toBe('rest-probe.png')
    expect(json.doc.url).toBe('https://fakestore.public.blob.vercel-storage.com/rest-probe.png')
  })
})

describe('revalidatePath outside a request', () => {
  it('raw next/cache revalidatePath throws outside a request; the guarded helper does not', async () => {
    const cache = await import('next/cache')
    let raw: unknown = null
    try {
      cache.revalidatePath('/')
    } catch (err) {
      raw = err
    }
    expect(raw).toBeInstanceOf(Error)
    const { revalidatePaths } = await import('../../payload/hooks/revalidate')
    await expect(revalidatePaths(['/', '/sponsors'], {}, ['playhq'])).resolves.toBeUndefined()
  })
})

describe('array _order base', () => {
  it('array rows are stored with _order starting at 1', async () => {
    const doc = await payload.create({ collection: 'array-probe', data: { honours: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] } })
    const res = await payload.db.pool.query(
      'select _order, title from probe.array_probe_honours where _parent_id = $1 order by _order',
      [doc.id],
    )
    expect(res.rows.map((r: { _order: number }) => r._order)).toEqual([1, 2, 3])
  })
})

describe('REST join where syntax', () => {
  it('?joins[children][where][status][equals]=approved filters the join', async () => {
    const parent = await payload.create({ collection: 'join-parents', data: { title: 'p' } })
    await payload.create({ collection: 'join-children', data: { parent: parent.id, status: 'pending' } })
    const approved = await payload.create({ collection: 'join-children', data: { parent: parent.id, status: 'approved' } })
    const qs = 'depth=0&joins[children][where][status][equals]=approved'
    const res = await handleEndpoints({ config, request: new Request(`http://localhost:3000/api/join-parents/${parent.id}?${qs}`) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.children.docs).toEqual([approved.id])
    const all = await handleEndpoints({ config, request: new Request(`http://localhost:3000/api/join-parents/${parent.id}?depth=0`) })
    expect((await all.json()).children.docs).toHaveLength(2)
    const off = await handleEndpoints({
      config,
      request: new Request(`http://localhost:3000/api/join-parents/${parent.id}?depth=0&joins[children]=false`),
    })
    expect((await off.json()).children).toBeUndefined()
  })
})
