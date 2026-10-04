import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

/**
 * Route-level behaviour of /info/[slug] and /preview/[collection]/[id], with the Local API faked: unknown and
 * draft slugs are not found, a published page renders its blocks, the preview needs a session and refuses
 * a bad collection or id.
 */
let fake: PayloadFake
let staff = false

vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => Object.assign(Object.create(fake), { auth: async () => ({ user: staff ? { id: 1 } : null }) }) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/club', async () => {
  const { resolveClub } = await import('@/lib/club-merge')
  return { getClub: async () => resolveClub(null) }
})
vi.mock('@/lib/theme', async () => {
  const { resolveClub } = await import('@/lib/club-merge')
  return { getClubWithCrest: async () => resolveClub(null), getTheme: async () => ({}) }
})
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const lexical = (text: string) => ({
  root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] }] },
})

beforeEach(() => {
  staff = false
  fake = createPayloadFake({
    pages: [
      { id: 1, slug: 'about', title: 'About the club', status: 'published', updatedAt: '2026-05-01T00:00:00.000Z', createdAt: '2026-05-01T00:00:00.000Z', content: [
        { blockType: 'text', id: 'a', richText: lexical('We are a friendly club') },
        { blockType: 'cta', id: 'c', label: 'Get in touch', url: '/contact', style: 'primary', note: '' },
        { blockType: 'cta', id: 'x', label: 'Bad link', url: 'javascript:alert(1)', style: 'primary', note: '' },
      ] },
      { id: 2, slug: 'draft-season-plan', title: 'Draft season plan', status: 'draft', updatedAt: '2026-05-02T00:00:00.000Z', createdAt: '2026-05-02T00:00:00.000Z', content: [{ blockType: 'text', id: 'b', richText: lexical('Secret plan') }] },
    ],
  })
})

const render = (el: unknown) => renderToStaticMarkup(el as never)

describe('/info/[slug]', () => {
  it('renders a published page with its blocks, drops an unsafe button', async () => {
    const { default: Page } = await import('@/app/(frontend)/info/[slug]/page')
    const html = render(await Page({ params: Promise.resolve({ slug: 'about' }) }))
    expect(html).toContain('About the club')
    expect(html).toContain('We are a friendly club')
    expect(html).toContain('href="/contact"')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('application/ld+json')
  })

  it('an unknown slug and a draft are not found', async () => {
    const { default: Page } = await import('@/app/(frontend)/info/[slug]/page')
    await expect(Page({ params: Promise.resolve({ slug: 'nope' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(Page({ params: Promise.resolve({ slug: 'draft-season-plan' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('metadata: canonical, suffixed title, and "not found" for a draft', async () => {
    const { generateMetadata } = await import('@/app/(frontend)/info/[slug]/page')
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'about' }) })
    expect(meta.alternates).toEqual({ canonical: '/info/about' })
    expect(String(meta.title)).toMatch(/^About the club \| /)
    expect(meta.description).toBe('We are a friendly club')
    expect((await generateMetadata({ params: Promise.resolve({ slug: 'draft-season-plan' }) })).title).toBe('Page not found')
  })
})

describe('/preview/[collection]/[id]', () => {
  it('needs a session: anonymous visitors get not-found even for a real draft', async () => {
    const { default: Preview } = await import('@/app/(frontend)/preview/[collection]/[id]/page')
    await expect(Preview({ params: Promise.resolve({ collection: 'pages', id: '2' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows a draft to staff, marked as a preview', async () => {
    staff = true
    const { default: Preview } = await import('@/app/(frontend)/preview/[collection]/[id]/page')
    const html = render(await Preview({ params: Promise.resolve({ collection: 'pages', id: '2' }) }))
    expect(html).toContain('Secret plan')
    expect(html).toContain('still a draft')
  })

  it('rejects any collection other than pages or news, and a non-numeric id, even for staff', async () => {
    staff = true
    const { default: Preview } = await import('@/app/(frontend)/preview/[collection]/[id]/page')
    for (const [collection, id] of [['users', '1'], ['stories', '1'], ['pages', 'abc'], ['pages', '1 OR 1=1'], ['news', '1.5']]) {
      await expect(Preview({ params: Promise.resolve({ collection, id }) })).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(fake.callsTo('findByID')).toHaveLength(0)
  })

  it('a missing document is not found, and the route is noindex and never cached', async () => {
    staff = true
    const mod = await import('@/app/(frontend)/preview/[collection]/[id]/page')
    await expect(mod.default({ params: Promise.resolve({ collection: 'news', id: '77' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mod.dynamic).toBe('force-dynamic')
    expect(mod.metadata.robots).toEqual({ index: false, follow: false })
  })
})
