/**
 * Wave G WP-2b against real Postgres: sponsor logos in WebP, SVG and PNG are drawable and offered with a thumbnail; a logo that cannot
 * be used says why; the staff-only logo endpoint answers everyone else with one identical 404; social posts are not readable over
 * REST by anonymous visitors or selectors. Nothing leaves the machine (fetch is stubbed to fail).
 */
import sharp from 'sharp'
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor, wipeTestData } from './helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }))

const CTX = { disableRevalidate: true } as const
const SVG_OK = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" fill="#2a6"/><circle cx="40" cy="40" r="24" fill="#fff"/></svg>'
const SVG_BAD = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><image href="file:///etc/passwd" width="20" height="20"/></svg>'

describe('seed:demo social additions are idempotent', () => {
  it('creates the SVG, PNG and WebP sponsors once, and every one of them is drawable', async () => {
    const payload = await getTestPayload()
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'media')
    const { seedFormatSponsors } = await import('@/payload/seed/demo-social')
    expect(await seedFormatSponsors(payload)).toBe(3)
    expect(await seedFormatSponsors(payload)).toBe(0)
    expect((await payload.count({ collection: 'sponsors', overrideAccess: true })).totalDocs).toBe(3)
    const { sponsorLogo } = await import('@/lib/social/sources/logos')
    const docs = await payload.find({ collection: 'sponsors', depth: 1, overrideAccess: true, limit: 10 })
    for (const d of docs.docs) expect('dataUri' in (await sponsorLogo(payload, d.logo)), d.name).toBe(true)
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'media')
    await destroyTestPayload(payload)
  }, 60_000)
})

describe('sponsor logos and the logo endpoint', () => {
  let payload: Payload
  let admin: string, editor: string, selector: string
  const ids: Record<string, number> = {}
  const base = 'http://localhost:3000/api/admin/social'
  const hdr = (token?: string) => (token ? { Authorization: `JWT ${token}` } : undefined)
  const logo = async (id: string | number, token?: string) => {
    const { GET } = await import('@/app/api/admin/social/logo/[sponsorId]/route')
    return GET(new Request(`${base}/logo/${id}`, { headers: hdr(token) }), { params: Promise.resolve({ sponsorId: String(id) }) })
  }
  const sources = async (token: string) => {
    const { GET } = await import('@/app/api/admin/social/sources/route')
    return (await GET(new Request(`${base}/sources?type=sponsor-thanks`, { headers: hdr(token) }))).json() as Promise<{ version: number; choices: { id: string; note?: string; row?: { kind: string; logo: string; logoUrl?: string } }[] }>
  }

  beforeAll(async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => { throw new Error(`unexpected outbound call to ${String(input)}`) })
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'media')
    ;[admin, editor, selector] = [await tokenFor(payload, 'admin'), await tokenFor(payload, 'editor'), await tokenFor(payload, 'selector')]
    const solid = (fmt: 'webp' | 'png') => sharp({ create: { width: 240, height: 90, channels: 4, background: { r: 30, g: 90, b: 160, alpha: 1 } } })[fmt]().toBuffer()
    const mk = async (name: string, file: { data: Buffer; mimetype: string; name: string } | null, tier = 'Gold') => {
      const media = file ? await payload.create({ collection: 'media', data: { alt: name }, file: { ...file, size: file.data.length }, overrideAccess: true, context: CTX }) : null
      const s = await payload.create({ collection: 'sponsors', data: { name, tier, ...(media ? { logo: media.id } : {}), linkUrl: '' } as never, overrideAccess: true, context: CTX })
      ids[name] = s.id
    }
    await mk('Webp Sponsor', { data: await solid('webp'), mimetype: 'image/webp', name: 'logo-a.webp' })
    await mk('Svg Sponsor', { data: Buffer.from(SVG_OK), mimetype: 'image/svg+xml', name: 'logo-b.svg' })
    await mk('Png Sponsor', { data: await solid('png'), mimetype: 'image/png', name: 'logo-c.png' })
    await mk('Bad Svg Sponsor', { data: Buffer.from(SVG_BAD), mimetype: 'image/svg+xml', name: 'logo-d.svg' })
    await mk('Bare Sponsor', null)
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    await clearCollection(payload, 'sponsors')
    await clearCollection(payload, 'media')
    await clearCollection(payload, 'users')
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  it('offers a WebP, an SVG and a PNG logo as drawable with a thumbnail address, and says why a bad one is name only', async () => {
    const list = await sources(editor)
    expect(list.version).toBe(2)
    const of = (name: string) => list.choices.find((c) => c.id === String(ids[name]))!
    for (const name of ['Webp Sponsor', 'Svg Sponsor', 'Png Sponsor']) {
      expect(of(name).row, name).toMatchObject({ kind: 'sponsor', logo: 'ok', logoUrl: `/api/admin/social/logo/${ids[name]}` })
      expect(of(name).note).toBeUndefined()
    }
    expect(of('Bare Sponsor').row).toMatchObject({ logo: 'none' })
    expect(of('Bare Sponsor').note).toBeUndefined()
    expect(of('Bad Svg Sponsor').row).toMatchObject({ logo: 'failed' })
    expect(of('Bad Svg Sponsor').note).toBe('Bad Svg Sponsor: this logo file type cannot be drawn, so the name is shown.')
    // No row says the old sentence.
    expect(JSON.stringify(list)).not.toContain('no logo we can draw')
  }, 60_000)

  it('the thank-you picture draws all of them in every size', async () => {
    const { GET } = await import('@/app/api/admin/social/graphic/route')
    const source = ['Webp Sponsor', 'Svg Sponsor', 'Png Sponsor', 'Bare Sponsor'].map((n) => ids[n]).join(',')
    for (const size of ['square', 'story', 'landscape']) {
      const res = await GET(new Request(`${base}/graphic?type=sponsor-thanks&size=${size}&style=bold&source=${encodeURIComponent(source)}`, { headers: hdr(editor) }))
      expect(res.status, size).toBe(200)
    }
  }, 90_000)

  it('serves a drawable logo to staff as a PNG with the private headers', async () => {
    for (const token of [editor, admin]) {
      const res = await logo(ids['Webp Sponsor'], token)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      expect(res.headers.get('cache-control')).toBe('private, no-store')
      expect(res.headers.get('x-robots-tag')).toBe('noindex')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(Buffer.from(await res.arrayBuffer()).subarray(1, 4).toString()).toBe('PNG')
    }
  })

  it('answers anonymous, a selector, a non-sponsor id, a sponsor with no logo and an undrawable logo with the same 404', async () => {
    const media = await payload.find({ collection: 'media', limit: 1, depth: 0, overrideAccess: true })
    const answers = [
      await logo(ids['Webp Sponsor']),
      await logo(ids['Webp Sponsor'], selector),
      await logo(media.docs[0].id + 100000, editor),
      await logo(ids['Bare Sponsor'], editor),
      await logo(ids['Bad Svg Sponsor'], editor),
      await logo('abc', editor),
    ]
    const shapes = await Promise.all(answers.map(async (r) => ({ status: r.status, body: await r.text(), headers: Object.fromEntries(r.headers.entries()) })))
    for (const s of shapes) {
      expect(s.status).toBe(404)
      expect(s).toEqual(shapes[0])
    }
  })

  it('a media id is never read through the sponsor address', async () => {
    const m = await payload.find({ collection: 'media', limit: 50, depth: 0, overrideAccess: true })
    const sponsorIds = new Set(Object.values(ids))
    const stray = m.docs.find((d) => !sponsorIds.has(d.id))
    if (stray) expect((await logo(stray.id, editor)).status).toBe(404)
  })

  it('social posts are not readable over REST by anonymous visitors or selectors', async () => {
    expect((await rest('GET', '/social-posts')).status).toBeGreaterThanOrEqual(401)
    expect((await rest('GET', '/social-posts', { token: selector })).status).toBe(403)
    expect((await rest('GET', '/social-post-targets')).status).toBeGreaterThanOrEqual(401)
  })
})
