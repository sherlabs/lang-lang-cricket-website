import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

// Outside a Next request there is no incremental cache: pass the cached nav query straight through.
vi.mock('next/cache', async (orig) => ({ ...(await orig<typeof import('next/cache')>()), unstable_cache: (fn: unknown) => fn }))

describe('pages', () => {
  let payload: Payload
  let editor: string
  let admin: string
  const mediaIds: number[] = []
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  const ctx = { disableRevalidate: true }
  // Loosely typed: required-with-default fields (status, placement) are not optional in the generated create type.
  const make = (data: Record<string, unknown>) => payload.create({ collection: 'pages', data: data as never, context: ctx })
  const edit = (id: number, data: Record<string, unknown>) => payload.update({ collection: 'pages', id, data: data as never, context: ctx })
  const text = (t: string) => ({
    blockType: 'text' as const,
    richText: { root: { type: 'root', direction: 'ltr' as const, format: '' as const, indent: 0, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: t, format: 0, detail: 0, mode: 'normal', style: '' }] }] } },
  })

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'pages')
    editor = await tokenFor(payload, 'editor')
    admin = await tokenFor(payload, 'admin')
  })
  afterAll(async () => {
    for (const id of mediaIds) await payload.delete({ collection: 'media', id, context: ctx }).catch(() => {})
    await clearCollection(payload, 'pages')
    await destroyTestPayload(payload)
  })

  it('anonymous REST sees published pages only; a draft by id is not found; anonymous cannot write', async () => {
    const pub = await make({ title: 'Public page', status: 'published', content: [text('hi')] })
    const draft = await make({ title: 'Draft page', status: 'draft' })
    const list = await rest('GET', '/pages?limit=50')
    expect(list.status).toBe(200)
    expect(list.json.docs.map((d: { title: string }) => d.title)).toEqual(['Public page'])
    expect((await rest('GET', `/pages/${pub.id}`)).status).toBe(200)
    expect((await rest('GET', `/pages/${draft.id}`)).status).toBe(404)
    expect((await rest('POST', '/pages', { body: { title: 'x' } })).status).toBe(403)
    expect((await rest('PATCH', `/pages/${pub.id}`, { body: { title: 'y' } })).status).toBe(403)
    expect((await rest('DELETE', `/pages/${pub.id}`)).status).toBe(403)
    // staff see the draft
    expect((await rest('GET', `/pages/${draft.id}`, { token: editor })).status).toBe(200)
  })

  it('an editor can create, update and delete; the slug comes from the title and a REST slug is ignored', async () => {
    const created = await rest('POST', '/pages', { token: editor, body: { title: 'Join the club', slug: 'sneaky' } })
    expect(created.status).toBe(201)
    expect(created.json.doc).toMatchObject({ slug: 'join-the-club', status: 'draft', showInNavigation: 'clubhouse', navOrder: 100 })
    const id = created.json.doc.id
    const patched = await rest('PATCH', `/pages/${id}`, { token: editor, body: { status: 'published', content: [{ blockType: 'cta', label: 'Contact us', url: '/contact', style: 'primary' }] } })
    expect(patched.status).toBe(200)
    expect(patched.json.doc.publishedAt).toBeTruthy()
    expect((await rest('DELETE', `/pages/${id}`, { token: editor })).status).toBe(200)
  })

  it('slugs are unique (-2) and stable: a title edit never changes the slug, and "Index" is not a slug', async () => {
    const a = await make({ title: 'Ground map' })
    const b = await make({ title: 'Ground map' })
    expect([a.slug, b.slug]).toEqual(['ground-map', 'ground-map-2'])
    const renamed = await edit(a.id, { title: 'A very different title' })
    expect(renamed.slug).toBe('ground-map')
    const idx = await make({ title: 'Index' })
    expect(idx.slug).toBe('index-2')
  })

  it('a bad slug is rejected; only an admin may change one, a committee editor cannot', async () => {
    const page = await make({ title: 'Slug subject' })
    expect((await rest('PATCH', `/pages/${page.id}`, { token: admin, body: { slug: 'Bad Slug' } })).status).toBe(400)
    expect((await rest('PATCH', `/pages/${page.id}`, { token: admin, body: { slug: 'index' } })).status).toBe(400)
    const ok = await rest('PATCH', `/pages/${page.id}`, { token: admin, body: { slug: 'renamed-by-admin' } })
    expect(ok.status).toBe(200)
    expect(ok.json.doc.slug).toBe('renamed-by-admin')
    const byEditor = await rest('PATCH', `/pages/${page.id}`, { token: editor, body: { slug: 'editor-rename', title: 'Slug subject 2' } })
    expect(byEditor.status).toBe(200)
    expect(byEditor.json.doc.slug).toBe('renamed-by-admin')
  })

  it('validates blocks: a button link must be http(s) or a site path, an image needs alt text, more than 40 blocks fail', async () => {
    const bad = await rest('POST', '/pages', { token: editor, body: { title: 'Bad button', content: [{ blockType: 'cta', label: 'x', url: 'javascript:alert(1)', style: 'primary' }] } })
    expect(bad.status).toBe(400)
    const many = await rest('POST', '/pages', { token: editor, body: { title: 'Too many', content: Array.from({ length: 41 }, () => ({ blockType: 'cta', label: 'x', url: '/a', style: 'primary' })) } })
    expect(many.status).toBe(400)
    // Real (1x1 PNG) uploads, removed in afterAll so the shared media table is left as found.
    const upload = async (name: string, alt: string) => {
      const m = await payload.create({ collection: 'media', data: { alt }, file: { data: PNG, mimetype: 'image/png', name, size: PNG.length }, context: ctx })
      mediaIds.push(m.id)
      return m
    }
    const withAlt = await upload('wpp-alt-default.png', 'From the library')
    const defaulted = await make({ title: 'Alt from media', content: [{ blockType: 'image', image: withAlt.id, alt: '', width: 'wide' }] })
    expect(defaulted.content?.[0]).toMatchObject({ blockType: 'image', alt: 'From the library' })
    const noAlt = await upload('wpp-no-alt.png', '')
    const refused = await rest('POST', '/pages', { token: editor, body: { title: 'No alt anywhere', content: [{ blockType: 'image', image: noAlt.id, alt: '', width: 'wide' }] } })
    expect(refused.status).toBe(400)
  })

  it('getNavigation includes a published clubhouse page, and unpublishing removes it', async () => {
    const { getNavigation } = await import('@/lib/navigation-queries')
    const page = await make({ title: 'Nav test page', status: 'published', showInNavigation: 'clubhouse', navLabel: 'Nav test' })
    expect((await getNavigation()).clubhouse).toContainEqual({ href: `/info/${page.slug}`, label: 'Nav test' })
    await edit(page.id, { status: 'draft' })
    expect((await getNavigation()).clubhouse.map((l) => l.href)).not.toContain(`/info/${page.slug}`)
    await edit(page.id, { status: 'published', showInNavigation: 'none' })
    expect((await getNavigation()).clubhouse.map((l) => l.href)).not.toContain(`/info/${page.slug}`)
  })

  it('getPublishedPage returns published pages only', async () => {
    const { getPublishedPage } = await import('@/lib/pages-queries')
    const pub = await make({ title: 'Query page', status: 'published', content: [text('Body')] })
    const draft = await make({ title: 'Query draft', status: 'draft' })
    expect((await getPublishedPage(pub.slug!))?.blocks).toHaveLength(1)
    expect(await getPublishedPage(draft.slug!)).toBeNull()
  })

  it('deleting a picture a page uses succeeds and the public page drops that block instead of failing', async () => {
    const m = await payload.create({ collection: 'media', data: { alt: 'Gone soon' }, file: { data: PNG, mimetype: 'image/png', name: 'gone-soon.png', size: PNG.length }, context: ctx })
    mediaIds.push(m.id)
    const page = await make({ title: 'Has a picture', status: 'published', content: [text('kept'), { blockType: 'image', image: m.id, alt: 'Gone soon', width: 'wide' }] })
    await expect(payload.delete({ collection: 'media', id: m.id, context: ctx })).resolves.toBeTruthy()
    const after = await payload.findByID({ collection: 'pages', id: page.id, depth: 1 })
    const img = (after.content ?? []).find((b) => b.blockType === 'image') as { image?: unknown } | undefined
    expect(img?.image ?? null).toBeNull()
  })
})
