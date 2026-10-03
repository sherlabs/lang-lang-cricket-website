/**
 * stories.int (spec §15; replaces stories-queries + stories-admin-actions): the slug hook
 * (reserved words, collisions, never changes), tokens, `submittedByAdmin`, the lifecycle
 * timestamps (re-approval keeps publishedAt, nothing backdates them), excerpt derivation, the
 * public-edit rule, the `context.etl` bypasses, the public submit → approve → render path with
 * an inline image on the fake Blob store, the token-edit round trip, and the query layer.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
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
const jar = vi.hoisted(() => new Map<string, string>())

vi.mock(blob.pluginBlobPath, async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('@vercel/blob', async (importOriginal) => ({ ...(await importOriginal<Record<string, unknown>>()), put: blob.put, del: blob.del, head: blob.head }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${to}` })
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => jar.set(n, v) }),
  headers: async () => new Headers(),
}))

const BASE = 'https://fakestore.public.blob.vercel-storage.com'
const ctx = { disableRevalidate: true }
let payload: Payload
let editor: string

const lex = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: null,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '',
      indent: 0,
      version: 1,
      direction: null,
      textFormat: 0,
      textStyle: '',
      children: [{ type: 'text', text, format: 0, mode: 'normal', style: '', detail: 0, version: 1 }],
    })),
  },
})

const create = (data: Record<string, unknown>, context: Record<string, unknown> = ctx) =>
  payload.create({ collection: 'stories', data: { content: lex('Body text.'), authorName: 'Ann', ...data } as never, context })

beforeAll(async () => {
  payload = await getTestPayload()
  await clearCollection(payload, 'stories')
  editor = await tokenFor(payload, 'editor', 'stories-editor@example.com')
})

afterAll(async () => {
  await destroyTestPayload(payload)
  delete process.env.PAYLOAD_BLOB_FAKE
})

beforeEach(() => {
  blob.head.mockClear()
  jar.clear()
})

describe('stories: slug hook', () => {
  it('slugs the title, appends -2/-3 on collision and avoids the reserved submit/drafts', async () => {
    const a = await create({ title: 'Grand Final 1999' })
    const b = await create({ title: 'Grand final 1999!' })
    const c = await create({ title: 'Submit' })
    const d = await create({ title: 'Drafts' })
    const e = await create({ title: '日本語' })
    expect([a.slug, b.slug, c.slug, d.slug, e.slug]).toEqual(['grand-final-1999', 'grand-final-1999-2', 'submit-2', 'drafts-2', 'story'])
  })

  it('never changes on update (title edits, REST slug writes)', async () => {
    const s = await create({ title: 'Stable Slug' })
    const res = await rest('PATCH', `/stories/${s.id}`, { token: editor, body: { title: 'Renamed entirely', slug: 'mine' } })
    expect(res.json.doc).toMatchObject({ title: 'Renamed entirely', slug: 'stable-slug' })
  })

  it('ignores a slug supplied on REST create', async () => {
    const res = await rest('POST', '/stories', { token: editor, body: { title: 'Hello There', slug: 'custom', content: lex('x'), authorName: 'A' } })
    expect(res.json.doc.slug).toBe('hello-there')
  })
})

describe('stories: tokens, author and status defaults', () => {
  it('generates distinct UUID tokens on create; staff create → published + submittedByAdmin; club name as default author', async () => {
    const res = await rest('POST', '/stories', { token: editor, body: { title: 'Staff story', content: lex('x'), authorName: '' } })
    expect(res.status).toBe(201)
    const doc = await payload.findByID({ collection: 'stories', id: res.json.doc.id, depth: 0 })
    expect(doc.editToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(doc.viewToken).toMatch(/^[0-9a-f-]{36}$/)
    expect(doc.editToken).not.toBe(doc.viewToken)
    expect(doc).toMatchObject({ status: 'published', submittedByAdmin: true, authorName: 'Lang Lang Cricket Club', reviewedAt: null })
    expect(doc.publishedAt).toBeTruthy()
  })

  it('a public create is pending and not by an admin, whatever the data says', async () => {
    const doc = await create({ title: 'From a visitor', status: 'published', submittedByAdmin: true, publishedAt: '2000-01-01T00:00:00.000Z' }, { ...ctx, publicSubmission: true })
    expect(doc).toMatchObject({ status: 'pending', submittedByAdmin: false, publishedAt: null, reviewedAt: null })
  })
})

describe('stories: lifecycle', () => {
  it('approve stamps publishedAt + reviewedAt; reject stamps reviewedAt; re-approval keeps publishedAt', async () => {
    const s = await create({ title: 'Lifecycle', status: 'pending' }, { ...ctx, publicSubmission: true })
    const approved = await rest('PATCH', `/stories/${s.id}`, { token: editor, body: { status: 'published' } })
    const firstPublished = approved.json.doc.publishedAt
    expect(firstPublished).toBeTruthy()
    expect(approved.json.doc.reviewedAt).toBeTruthy()
    await new Promise((r) => setTimeout(r, 20))
    const rejected = await rest('PATCH', `/stories/${s.id}`, { token: editor, body: { status: 'rejected' } })
    expect(rejected.json.doc.publishedAt).toBe(firstPublished)
    expect(rejected.json.doc.reviewedAt > approved.json.doc.reviewedAt).toBe(true)
    await rest('PATCH', `/stories/${s.id}`, { token: editor, body: { status: 'pending' } })
    const again = await rest('PATCH', `/stories/${s.id}`, { token: editor, body: { status: 'published' } })
    expect(again.json.doc.publishedAt).toBe(firstPublished)
  })

  it('an editor cannot set publishedAt/reviewedAt/submittedByAdmin, on create or update', async () => {
    const res = await rest('POST', '/stories', {
      token: editor,
      body: { title: 'Backdated', content: lex('x'), authorName: 'A', status: 'pending', publishedAt: '2000-01-01T00:00:00.000Z', reviewedAt: '2000-01-01T00:00:00.000Z', submittedByAdmin: false },
    })
    expect(res.json.doc).toMatchObject({ publishedAt: null, reviewedAt: null, submittedByAdmin: true })
    const upd = await rest('PATCH', `/stories/${res.json.doc.id}`, { token: editor, body: { publishedAt: '2000-01-01T00:00:00.000Z' } })
    expect(upd.json.doc.publishedAt).toBeNull()
  })

  it('derives an empty excerpt from the body and keeps a written one', async () => {
    const long = 'word '.repeat(60).trim()
    const a = await create({ title: 'Excerpt A', content: lex('First paragraph.', long) })
    const excerpt = a.excerpt ?? ''
    expect(excerpt.startsWith('First paragraph. word word')).toBe(true)
    expect(excerpt.endsWith('…')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(161)
    const b = await create({ title: 'Excerpt B', excerpt: 'Hand-written.' })
    expect(b.excerpt).toBe('Hand-written.')
  })
})

describe('stories: context.etl keeps every supplied value', () => {
  it('round-trips slug, tokens, submittedByAdmin, status, timestamps and an empty excerpt', async () => {
    const data = {
      title: 'Imported',
      slug: 'drafts',
      excerpt: '',
      status: 'rejected',
      submittedByAdmin: true,
      editToken: 'eeeeeeee-0000-4000-8000-000000000001',
      viewToken: 'eeeeeeee-0000-4000-8000-000000000002',
      publishedAt: '2025-12-02T02:00:00.000Z',
      reviewedAt: '2026-01-05T02:00:00.000Z',
      authorName: '',
    }
    const doc = await create(data, { etl: true, disableRevalidate: true })
    expect(doc).toMatchObject({ ...data, authorName: '' })
  })
})

describe('stories: public submit → approve → render, and the token edit', () => {
  it('a public submission with an inline image (fake Blob, register path) is pending, approvable and renders the image and formatting', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    const src = `${BASE}/stories/pending/team-photo-Ab12Cd.jpg`
    const json = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Our day' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'It was ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'great' }] },
        { type: 'image', attrs: { src, alt: 'The team', title: null } },
        { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'link', attrs: { href: 'https://example.com/x' } }], text: 'link' }] },
      ],
    }
    const fd = new FormData()
    for (const [k, v] of Object.entries({ title: 'Public with image', authorName: 'Visitor', authorEmail: 'v@example.com', contentJson: JSON.stringify(json) })) fd.set(k, v)
    await expect(submitStory(fd)).rejects.toThrow('NEXT_REDIRECT')
    const cookie = JSON.parse(jar.get('llcc_story_draft')!)
    expect(cookie.editToken).toMatch(/^[0-9a-f-]{36}$/)

    const { docs } = await payload.find({ collection: 'stories', where: { title: { equals: 'Public with image' } }, depth: 0 })
    const story = docs[0]
    expect(story).toMatchObject({ status: 'pending', submittedByAdmin: false, slug: 'public-with-image', editToken: cookie.editToken, viewToken: cookie.viewToken })
    expect(blob.head).toHaveBeenCalledWith(src, expect.anything())
    const media = await payload.find({ collection: 'media', where: { filename: { equals: 'team-photo-Ab12Cd.jpg' } }, depth: 0 })
    expect(media.docs[0]).toMatchObject({ prefix: 'stories/pending', alt: 'The team', url: src })

    // Not public yet.
    const { getPublishedStoryBySlug, getStoryByViewToken } = await import('@/lib/stories-queries')
    expect(await getPublishedStoryBySlug('public-with-image')).toBeNull()
    expect((await getStoryByViewToken(cookie.viewToken))?.status).toBe('pending')

    // Approve as the moderation controls do (a status change on save).
    expect((await rest('PATCH', `/stories/${story.id}`, { token: editor, body: { status: 'published' } })).json.doc.status).toBe('published')
    const live = await getPublishedStoryBySlug('public-with-image')
    expect(live).not.toHaveProperty('editToken')
    expect(live).not.toHaveProperty('authorEmail')
    const { StoryBody } = await import('@/components/stories/story-body')
    const html = renderToStaticMarkup(StoryBody({ content: live!.content, className: 'story-content mt-10' }))
    expect(html).toContain('<h2>Our day</h2>')
    expect(html).toContain('<strong>great</strong>')
    expect(html).toContain(`<img src="${src}" alt="The team" loading="lazy"/>`)
    expect(html).toContain('<a href="https://example.com/x">link</a>')
    expect(html).not.toContain('dangerously')
  })

  it('refuses a foreign inline image', async () => {
    const { submitStory } = await import('@/app/(frontend)/history/submit/actions')
    const fd = new FormData()
    fd.set('title', 'Foreign')
    fd.set('authorName', 'X')
    fd.set('contentJson', JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }, { type: 'image', attrs: { src: 'https://evil.example/t.gif' } }] }))
    expect(await submitStory(fd)).toEqual({ error: 'Images must be uploaded through the form.' })
    expect((await payload.count({ collection: 'stories', where: { title: { equals: 'Foreign' } } })).totalDocs).toBe(0)
  })

  it('the token edit loads the stored story as HTML, saves it back (legacy image resolved) and sends a published story to pending', async () => {
    // A legacy-style story: an own-store image with an old-style name, registered by the ETL.
    const legacyUrl = `${BASE}/stories/Old Photo (1).jpg`.replace(/ /g, '%20').replace('(', '%28').replace(')', '%29')
    const m = await payload.create({
      collection: 'media',
      data: { filename: 'Old Photo (1).jpg', prefix: 'stories', mimeType: 'image/jpeg', focalX: 50, focalY: 50, alt: 'Old', legacyUrl },
      context: { etl: true, disableRevalidate: true },
    })
    const { htmlToLexical, resolveUploadNodes } = await import('@/lib/stories-convert')
    const content = await htmlToLexical(`<p>Legacy text.</p><img src="${legacyUrl}">`, payload.config)
    await resolveUploadNodes(content, { payload, mode: 'etl', register: async () => null })
    const s = await create({ title: 'Legacy published', content, status: 'published' })
    const { editToken, publishedAt } = await payload.findByID({ collection: 'stories', id: s.id, depth: 0 })

    const { getStoryForEdit } = await import('@/lib/stories-queries')
    const found = await getStoryForEdit(editToken!)
    expect(found?.contentHtml).toContain('<p>Legacy text.</p>')
    expect(found?.contentHtml).toContain(`<img src="${legacyUrl}" alt="Old">`)

    // What Tiptap posts back after loading that HTML (its JSON), plus a crafted status.
    const json = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy text, edited.' }] }, { type: 'image', attrs: { src: legacyUrl, alt: 'Old', title: null } }] }
    const fd = new FormData()
    for (const [k, v] of Object.entries({ title: 'Legacy published', authorName: 'Ann', contentJson: JSON.stringify(json), status: 'published' })) fd.set(k, v)
    const { updateDraftByToken } = await import('@/app/(frontend)/history/drafts/[token]/edit/actions')
    expect(await updateDraftByToken(editToken!, fd)).toBeUndefined()

    const after = await payload.findByID({ collection: 'stories', id: s.id, depth: 0 })
    expect(after).toMatchObject({ status: 'pending', editToken, publishedAt })
    const uploads = (after.content as unknown as { root: { children: { type: string; value?: unknown }[] } }).root.children.filter((n) => n.type === 'upload')
    expect(uploads.map((u) => u.value)).toEqual([m.id])
    expect(after.excerpt).toBe('Legacy text, edited.')
  })
})

describe('stories: query layer', () => {
  it('lists published stories only, newest publishedAt first, and refuses non-token-shaped tokens', async () => {
    const { listPublishedStories, getStoryByEditToken, getStoryByViewToken } = await import('@/lib/stories-queries')
    const list = await listPublishedStories()
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((s) => s.status === 'published')).toBe(true)
    const times = list.map((s) => s.publishedAt?.getTime() ?? 0)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    expect(await getStoryByEditToken('')).toBeNull()
    expect(await getStoryByViewToken('short')).toBeNull()
  })
})
