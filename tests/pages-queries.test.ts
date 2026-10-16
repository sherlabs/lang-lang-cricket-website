import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

const lexical = (text: string) => ({
  root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] }] },
})

beforeEach(() => {
  fake = createPayloadFake({
    pages: [
      { id: 1, slug: 'about', title: 'About', status: 'published', updatedAt: '2026-05-01T00:00:00.000Z', createdAt: '2026-05-01T00:00:00.000Z', content: [
        { blockType: 'text', id: 'a', richText: lexical('Hello from the club') },
        { blockType: 'image', id: 'b', image: { id: 9, url: '/m/x.jpg' }, alt: 'Ground', caption: 'The ground', width: 'wide' },
        { blockType: 'image', id: 'c', image: 9, alt: 'No file', width: 'wide' },
        { blockType: 'cta', id: 'd', label: 'Join', url: '/contact', style: 'outline', note: '' },
      ] },
      { id: 2, slug: 'secret', title: 'Secret', status: 'draft', updatedAt: '2026-05-02T00:00:00.000Z', createdAt: '2026-05-02T00:00:00.000Z', content: [] },
    ],
  })
})

describe('pages queries', () => {
  it('getPublishedPage states its own published filter and returns blocks in render shape', async () => {
    const { getPublishedPage } = await import('../lib/pages-queries')
    const page = await getPublishedPage('about')
    const call = fake.callsTo('find', 'pages')[0]
    expect(call.args.where).toEqual({ and: [{ slug: { equals: 'about' } }, { status: { equals: 'published' } }] })
    expect(page?.title).toBe('About')
    // an image whose picture is not populated is dropped
    expect(page?.blocks.map((b) => b.blockType)).toEqual(['text', 'image', 'cta'])
    expect(page?.blocks[1]).toMatchObject({ url: '/m/x.jpg', alt: 'Ground', caption: 'The ground', width: 'wide' })
  })

  it('a draft, an unknown slug and an empty slug all give null', async () => {
    const { getPublishedPage } = await import('../lib/pages-queries')
    expect(await getPublishedPage('secret')).toBeNull()
    expect(await getPublishedPage('nope')).toBeNull()
    expect(await getPublishedPage('')).toBeNull()
  })

  it('the sitemap and nav lists only read published pages', async () => {
    const { listPublishedPageSlugs, listNavPages } = await import('../lib/pages-queries')
    expect((await listPublishedPageSlugs()).map((p) => p.slug)).toEqual(['about'])
    expect(fake.callsTo('find', 'pages')[0].args.where).toEqual({ status: { equals: 'published' } })
    await listNavPages()
    expect(JSON.stringify(fake.callsTo('find', 'pages')[1].args.where)).toContain('published')
  })

  it('pageDescription prefers the SEO description, else the start of the first text block', async () => {
    const { pageDescription } = await import('../lib/pages-queries')
    const blocks = [{ blockType: 'text' as const, id: 'a', content: lexical('Hello from the club') as never }]
    expect(pageDescription({ seoDescription: 'Custom', blocks })).toBe('Custom')
    expect(pageDescription({ seoDescription: '', blocks })).toBe('Hello from the club')
    expect(pageDescription({ seoDescription: '', blocks: [] })).toBe('')
  })
})
