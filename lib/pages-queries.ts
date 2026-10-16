import 'server-only'
import type { NavPage, PageView } from '@/lib/domain'
import { getPayloadClient } from '@/lib/payload/client'
import { toNavPage, toPageView } from '@/lib/payload/mappers'
import { excerptFromContent } from '@/payload/hooks/storyLifecycle'

/**
 * Public page reads (WP-P). The Local API runs with overrideAccess, so the REST `read` rule does not
 * protect these: every query states `status = published` itself. Drafts reach the screen only through
 * the staff-only preview route (`lib/preview-queries.ts`).
 */
const PUBLISHED = { status: { equals: 'published' } } as const

export async function getPublishedPage(slug: string): Promise<PageView | null> {
  if (typeof slug !== 'string' || !slug) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { and: [{ slug: { equals: slug } }, PUBLISHED] },
    limit: 1,
    depth: 1,
  })
  return docs[0] ? toPageView(docs[0]) : null
}

/** What the sitemap needs: slugs and modification dates of published pages. */
export async function listPublishedPageSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: PUBLISHED,
    pagination: false,
    depth: 0,
    select: { slug: true, updatedAt: true },
    sort: 'id',
  })
  return docs.filter((d) => d.slug).map((d) => ({ slug: d.slug as string, updatedAt: new Date(d.updatedAt) }))
}

/** Published pages with a menu placement, for `buildNavigation`. Card fields only. */
export async function listNavPages(): Promise<NavPage[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'pages',
    where: { and: [PUBLISHED, { showInNavigation: { not_equals: 'none' } }] },
    pagination: false,
    depth: 0,
    select: { slug: true, title: true, navLabel: true, showInNavigation: true, navOrder: true },
    sort: ['navOrder', 'title'],
  })
  return docs.map((d) => toNavPage(d)).filter((p) => p.slug)
}

/** The description a page shares with search engines: its own, else the start of the first text block. */
export function pageDescription(page: Pick<PageView, 'seoDescription' | 'blocks'>): string {
  if (page.seoDescription) return page.seoDescription
  const first = page.blocks.find((b) => b.blockType === 'text')
  return first && first.blockType === 'text' ? excerptFromContent(first.content) : ''
}
