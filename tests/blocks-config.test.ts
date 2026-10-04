import { describe, expect, it } from 'vitest'
import { MAX_PAGE_BLOCKS, pageBlocks } from '../payload/fields/blocks'
import { Pages } from '../payload/collections/Pages'
import { News } from '../payload/collections/News'
import { httpUrlOrPath } from '../payload/fields/validators'

const field = (fields: readonly { name?: string }[], name: string) => fields.find((f) => f.name === name) as Record<string, unknown>

describe('page blocks', () => {
  it('are exactly three: text, image, cta (a new block updates this test with its component and renderer)', () => {
    expect(pageBlocks.map((b) => b.slug)).toEqual(['text', 'image', 'cta'])
  })

  it('a page holds at most 40 blocks', () => {
    const content = field(Pages.fields as never, 'content')
    expect(content.type).toBe('blocks')
    expect(content.maxRows).toBe(40)
    expect(MAX_PAGE_BLOCKS).toBe(40)
  })

  it('the cta url uses the http(s)-or-site-path validator and is required', () => {
    const cta = pageBlocks.find((b) => b.slug === 'cta')!
    const url = field(cta.fields as never, 'url') as { required: boolean; validate: (v: unknown) => true | string }
    expect(url.required).toBe(true)
    expect(url.validate('/contact')).toBe(true)
    expect(url.validate('javascript:alert(1)')).not.toBe(true)
    expect(url.validate('')).not.toBe(true)
    expect(httpUrlOrPath('https://example.com')).toBe(true)
  })

  it('the image block requires a picture and alt text, and the text block is a rich text field', () => {
    const image = pageBlocks.find((b) => b.slug === 'image')!
    expect(field(image.fields as never, 'image').required).toBe(true)
    expect(field(image.fields as never, 'alt').required).toBe(true)
    expect(field(image.fields as never, 'width').defaultValue).toBe('wide')
    const text = pageBlocks.find((b) => b.slug === 'text')!
    expect(field(text.fields as never, 'richText').type).toBe('richText')
  })
})

describe('collection access', () => {
  const anon = { req: { user: undefined } } as never
  const staff = { req: { user: { id: 1, role: 'editor' } } } as never

  it('pages: anonymous read is published only, staff read everything and write', () => {
    const read = Pages.access!.read as (a: never) => unknown
    expect(read(anon)).toEqual({ status: { equals: 'published' } })
    expect(read(staff)).toBe(true)
    for (const op of ['create', 'update', 'delete'] as const) {
      const f = Pages.access![op] as (a: never) => unknown
      expect(f(staff)).toBe(true)
      expect(f(anon)).toBe(false)
    }
    expect(Pages.disableDuplicate).toBe(true)
  })

  it('news: anonymous read needs published and a date that has come, evaluated per call', async () => {
    const read = News.access!.read as (a: never) => { and: { publishedAt?: { less_than_equal: string } }[] }
    const first = read(anon).and[1].publishedAt!.less_than_equal
    await new Promise((r) => setTimeout(r, 5))
    const second = read(anon).and[1].publishedAt!.less_than_equal
    expect(read(anon).and[0]).toEqual({ status: { equals: 'published' } })
    expect(second > first).toBe(true)
    expect((News.access!.read as (a: never) => unknown)(staff)).toBe(true)
  })

  it('the slug field is writable by admins only and the status defaults to draft', () => {
    for (const c of [Pages, News]) {
      const slug = field(c.fields as never, 'slug') as { access: { create: (a: never) => boolean; update: (a: never) => boolean } }
      expect(slug.access.create({ req: { user: { role: 'admin' } } } as never)).toBe(false)
      expect(slug.access.update({ req: { user: { role: 'admin' } } } as never)).toBe(true)
      expect(slug.access.update({ req: { user: { role: 'editor' } } } as never)).toBe(false)
      expect(field(c.fields as never, 'status').defaultValue).toBe('draft')
    }
  })
})

describe('stampPublishedAt', () => {
  it('stamps a published document that has no date, keeps a chosen date, and re-stamps an emptied one', async () => {
    const { stampPublishedAt } = await import('../payload/hooks/publishedAt')
    const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) => (stampPublishedAt as (a: unknown) => Record<string, unknown>)({ data, originalDoc, req: { context: {} } })
    expect(run({ status: 'published' }).publishedAt).toBeTruthy()
    expect(run({ status: 'draft' }).publishedAt).toBeUndefined()
    expect(run({ status: 'published', publishedAt: '2030-01-01T00:00:00.000Z' }).publishedAt).toBe('2030-01-01T00:00:00.000Z')
    expect(run({ status: 'published' }, { publishedAt: '2026-01-01T00:00:00.000Z' }).publishedAt).toBeUndefined()
    expect(run({ status: 'published', publishedAt: null }, { publishedAt: '2026-01-01T00:00:00.000Z' }).publishedAt).toBeTruthy()
  })
})
