import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

const NOW = new Date('2026-10-04T12:00:00.000Z')
const body = (text: string) => ({
  root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [{ type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] }] },
})
const post = (id: number, over: Record<string, unknown>) => ({
  id, slug: `post-${id}`, title: `Post ${id}`, status: 'published', excerpt: '', body: body(`Body of post ${id}`), cover: null,
  publishedAt: '2026-10-01T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z', ...over,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fake = createPayloadFake({
    news: [
      post(1, { publishedAt: '2026-09-20T00:00:00.000Z' }),
      post(2, { publishedAt: '2026-09-28T00:00:00.000Z', excerpt: 'Saved summary', cover: { id: 4, url: '/c.jpg' } }),
      post(3, { status: 'draft', publishedAt: null }),
      post(4, { publishedAt: '2026-10-20T00:00:00.000Z' }), // scheduled for later
      post(5, { publishedAt: '2026-10-03T00:00:00.000Z' }),
    ],
  })
})
afterEach(() => vi.useRealTimers())

const VISIBLE = { and: [{ status: { equals: 'published' } }, { publishedAt: { less_than_equal: NOW.toISOString() } }] }

describe('news queries', () => {
  it('the shared filter is published and publishedAt <= now, taken per call', async () => {
    const { publishedNow } = await import('../lib/news-visibility')
    expect(publishedNow()).toEqual(VISIBLE)
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'))
    expect(publishedNow().and[1]).toEqual({ publishedAt: { less_than_equal: '2026-12-01T00:00:00.000Z' } })
  })

  it('listPublishedNews hides drafts and scheduled posts, newest first, and derives the excerpt from the body', async () => {
    const { listPublishedNews } = await import('../lib/news-queries')
    const { items } = await listPublishedNews()
    expect(fake.callsTo('find', 'news')[0].args.where).toEqual(VISIBLE)
    expect(items.map((p) => p.slug)).toEqual(['post-5', 'post-2', 'post-1'])
    expect(items[1]).toMatchObject({ excerpt: 'Saved summary', coverUrl: '/c.jpg' })
    expect(items[0].excerpt).toBe('Body of post 5')
  })

  it('listLatestNews(3) is the newest three visible posts', async () => {
    const { listLatestNews } = await import('../lib/news-queries')
    expect((await listLatestNews(3)).map((p) => p.slug)).toEqual(['post-5', 'post-2', 'post-1'])
    expect((await listLatestNews(1)).map((p) => p.slug)).toEqual(['post-5'])
    expect(fake.callsTo('find', 'news').at(-1)!.args.where).toEqual(VISIBLE)
  })

  it('getPublishedPost finds a visible post and refuses a draft, a scheduled post and an unknown slug', async () => {
    const { getPublishedPost } = await import('../lib/news-queries')
    expect((await getPublishedPost('post-2'))?.title).toBe('Post 2')
    expect(fake.callsTo('find', 'news')[0].args.where).toEqual({ and: [{ slug: { equals: 'post-2' } }, ...VISIBLE.and] })
    expect(await getPublishedPost('post-3')).toBeNull()
    expect(await getPublishedPost('post-4')).toBeNull()
    expect(await getPublishedPost('nope')).toBeNull()
    expect(await getPublishedPost('')).toBeNull()
  })

  it('the scheduled post becomes visible once its time passes', async () => {
    const { getPublishedPost } = await import('../lib/news-queries')
    expect(await getPublishedPost('post-4')).toBeNull()
    vi.setSystemTime(new Date('2026-10-21T00:00:00.000Z'))
    expect((await getPublishedPost('post-4'))?.slug).toBe('post-4')
  })

  it('previous and next links skip drafts and scheduled posts', async () => {
    const { getAdjacentPosts, getPublishedPost } = await import('../lib/news-queries')
    const mid = (await getPublishedPost('post-2'))!
    const { older, newer } = await getAdjacentPosts(mid)
    expect(older?.slug).toBe('post-1')
    expect(newer?.slug).toBe('post-5')
    const newest = (await getPublishedPost('post-5'))!
    expect((await getAdjacentPosts(newest)).newer).toBeNull()
  })

  it('the sitemap list and the news flag use the same visibility', async () => {
    const { listPublishedNewsSlugs, hasPublishedNews } = await import('../lib/news-queries')
    expect((await listPublishedNewsSlugs()).map((p) => p.slug)).toEqual(['post-1', 'post-2', 'post-5'])
    expect(await hasPublishedNews()).toBe(true)
    expect(fake.callsTo('count', 'news')[0].args.where).toEqual(VISIBLE)
    fake.store.news = [post(9, { publishedAt: '2026-11-01T00:00:00.000Z' })]
    expect(await hasPublishedNews()).toBe(false)
  })
})
