import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

describe('news', () => {
  let payload: Payload
  let editor: string
  const ctx = { disableRevalidate: true }
  // Loosely typed: required-with-default fields (status, placement) are not optional in the generated create type.
  const make = (data: Record<string, unknown>) => payload.create({ collection: 'news', data: data as never, context: ctx })
  const edit = (id: number, data: Record<string, unknown>) => payload.update({ collection: 'news', id, data: data as never, context: ctx })
  const body = (t: string) => ({ root: { type: 'root', direction: 'ltr' as const, format: '' as const, indent: 0, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: t, format: 0, detail: 0, mode: 'normal', style: '' }] }] } })
  const day = 86_400_000
  const at = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'news')
    editor = await tokenFor(payload, 'editor')
    await make({ title: 'Old post', status: 'published', publishedAt: at(-5), body: body('Old body') })
    await make({ title: 'New post', status: 'published', publishedAt: at(-1), body: body('New body'), excerpt: 'Saved summary' })
    await make({ title: 'Hidden draft', status: 'draft', body: body('Draft body') })
    await make({ title: 'Future post', status: 'published', publishedAt: at(3), body: body('Future body') })
  })
  afterAll(async () => {
    await destroyTestPayload(payload)
  })

  it('anonymous REST shows only published posts whose date has come; a scheduled or draft post by id is not found', async () => {
    const list = await rest('GET', '/news?limit=50&sort=-publishedAt')
    expect(list.json.docs.map((d: { title: string }) => d.title)).toEqual(['New post', 'Old post'])
    const all = await payload.find({ collection: 'news', pagination: false, overrideAccess: true })
    for (const t of ['Hidden draft', 'Future post']) {
      const doc = all.docs.find((d) => d.title === t)!
      expect((await rest('GET', `/news/${doc.id}`)).status).toBe(404)
      expect((await rest('GET', `/news/${doc.id}`, { token: editor })).status).toBe(200)
    }
  })

  it('anonymous cannot write; an editor can create, update and delete', async () => {
    expect((await rest('POST', '/news', { body: { title: 'x' } })).status).toBe(403)
    const created = await rest('POST', '/news', { token: editor, body: { title: 'Editor post', body: body('Hello') } })
    expect(created.status).toBe(201)
    expect(created.json.doc).toMatchObject({ slug: 'editor-post', status: 'draft' })
    const id = created.json.doc.id
    const patched = await rest('PATCH', `/news/${id}`, { token: editor, body: { status: 'published', title: 'Editor post renamed' } })
    expect(patched.status).toBe(200)
    // publishing stamps the date, and the title edit leaves the slug alone
    expect(patched.json.doc.publishedAt).toBeTruthy()
    expect(patched.json.doc.slug).toBe('editor-post')
    expect((await rest('DELETE', `/news/${id}`, { token: editor })).status).toBe(200)
  })

  it('the public queries hide drafts and scheduled posts, and a scheduled post appears once its time has come', async () => {
    const { listLatestNews, getPublishedPost, hasPublishedNews, listPublishedNews } = await import('@/lib/news-queries')
    expect((await listLatestNews(3)).map((p) => p.title)).toEqual(['New post', 'Old post'])
    expect((await listPublishedNews()).items[0].excerpt).toBe('Saved summary')
    expect((await listPublishedNews()).items[1].excerpt).toBe('Old body')
    expect(await getPublishedPost('hidden-draft')).toBeNull()
    expect(await getPublishedPost('future-post')).toBeNull()
    expect(await hasPublishedNews()).toBe(true)
    // time passes: move the scheduled date into the past
    const future = (await payload.find({ collection: 'news', where: { slug: { equals: 'future-post' } }, overrideAccess: true })).docs[0]
    await edit(future.id, { publishedAt: at(-0.01) })
    expect((await getPublishedPost('future-post'))?.title).toBe('Future post')
    expect((await listLatestNews(3)).map((p) => p.title)[0]).toBe('Future post')
  })

  it('slugs are unique and stable, a bad slug is rejected, and the body is required', async () => {
    const a = await make({ title: 'Same headline', body: body('a') })
    const b = await make({ title: 'Same headline', body: body('b') })
    expect([a.slug, b.slug]).toEqual(['same-headline', 'same-headline-2'])
    expect((await edit(a.id, { title: 'Changed' })).slug).toBe('same-headline')
    const admin = await tokenFor(payload, 'admin')
    expect((await rest('PATCH', `/news/${a.id}`, { token: admin, body: { slug: 'Not OK!' } })).status).toBe(400)
    expect((await rest('POST', '/news', { token: editor, body: { title: 'No body' } })).status).toBe(400)
  })
})
