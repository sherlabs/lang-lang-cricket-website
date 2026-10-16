import 'server-only'
import type { NewsSummary, NewsView } from '@/lib/domain'
import type { News as NewsDoc } from '@/payload-types'
import { publishedNow } from '@/lib/news-visibility'
import { getPayloadClient } from '@/lib/payload/client'
import { toNewsSummary, toNewsView } from '@/lib/payload/mappers'
import { excerptFromContent } from '@/payload/hooks/storyLifecycle'

/**
 * Public news reads (WP-P). The Local API runs with overrideAccess, so each query states its own filter:
 * `status = published` and `publishedAt <= now`, so a post scheduled for later is invisible until its
 * time. "Now" is taken per call, never at module load.
 */
export const NEWS_PAGE_SIZE = 12

export { publishedNow }

const summarise = (d: NewsDoc) => toNewsSummary(d, d.excerpt?.trim() || excerptFromContent(d.body))

/** One page of the news feed, newest first. */
export async function listPublishedNews(page = 1, limit = NEWS_PAGE_SIZE): Promise<{ items: NewsSummary[]; totalPages: number; page: number }> {
  const payload = await getPayloadClient()
  const res = await payload.find({
    collection: 'news',
    where: publishedNow(),
    sort: ['-publishedAt', '-id'],
    page: Math.max(1, Math.floor(page) || 1),
    limit,
    depth: 1,
    select: { slug: true, title: true, excerpt: true, body: true, cover: true, publishedAt: true, createdAt: true },
  })
  return { items: res.docs.map((d) => summarise(d as NewsDoc)), totalPages: Math.max(1, res.totalPages ?? 1), page: res.page ?? 1 }
}

/** The newest `limit` posts (home strip). */
export async function listLatestNews(limit: number): Promise<NewsSummary[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'news',
    where: publishedNow(),
    sort: ['-publishedAt', '-id'],
    limit,
    pagination: false,
    depth: 1,
    select: { slug: true, title: true, excerpt: true, body: true, cover: true, publishedAt: true, createdAt: true },
  })
  return docs.map((d) => summarise(d as NewsDoc))
}

export async function getPublishedPost(slug: string): Promise<NewsView | null> {
  if (typeof slug !== 'string' || !slug) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'news',
    where: { and: [{ slug: { equals: slug } }, ...publishedNow().and] },
    limit: 1,
    depth: 1,
  })
  return docs[0] ? toNewsView(docs[0], docs[0].excerpt?.trim() || excerptFromContent(docs[0].body)) : null
}

/**
 * The post before (older) and after (newer) `post`, among visible posts. Ordering matches the list view
 * (`-publishedAt`, `-id`), so posts sharing a `publishedAt` are still neighbours of each other.
 */
export async function getAdjacentPosts(post: Pick<NewsView, 'id' | 'publishedAt'>): Promise<{ older: NewsSummary | null; newer: NewsSummary | null }> {
  const payload = await getPayloadClient()
  const at = post.publishedAt.toISOString()
  const find = async (dir: 'older' | 'newer') => {
    const cmp = dir === 'older' ? 'less_than' : 'greater_than'
    const { docs } = await payload.find({
      collection: 'news',
      where: {
        and: [
          ...publishedNow().and,
          { or: [{ publishedAt: { [cmp]: at } }, { and: [{ publishedAt: { equals: at } }, { id: { [cmp]: post.id } }] }] },
        ],
      },
      sort: dir === 'older' ? ['-publishedAt', '-id'] : ['publishedAt', 'id'],
      limit: 1,
      pagination: false,
      depth: 0,
      select: { slug: true, title: true, publishedAt: true, createdAt: true },
    })
    return docs[0] ? toNewsSummary(docs[0] as NewsDoc, '') : null
  }
  const [older, newer] = await Promise.all([find('older'), find('newer')])
  return { older, newer }
}

/** Visible post slugs with modification dates, for the sitemap. */
export async function listPublishedNewsSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'news',
    where: publishedNow(),
    pagination: false,
    depth: 0,
    select: { slug: true, updatedAt: true },
    sort: 'id',
  })
  return docs.filter((d) => d.slug).map((d) => ({ slug: d.slug as string, updatedAt: new Date(d.updatedAt) }))
}

/** True when at least one post is visible (decides whether the menu links to /news). */
export async function hasPublishedNews(): Promise<boolean> {
  const payload = await getPayloadClient()
  const { totalDocs } = await payload.count({ collection: 'news', where: publishedNow() })
  return totalDocs > 0
}
