import 'server-only'
import type { GalleryPhoto, Sponsor } from '@/lib/domain'
import type { Yearbook as YearbookDoc } from '@/payload-types'
import { getPayloadClient } from '@/lib/payload/client'
import { mediaUrl, toGalleryPhoto, toSponsor } from '@/lib/payload/mappers'

/**
 * Public yearbook reads. The Local API runs with overrideAccess, so the REST `read` rule does
 * not protect these: every query states `status = published` itself (spec A9, draft leakage).
 */
const PUBLISHED = { status: { equals: 'published' } } as const

export type YearbookSummary = {
  id: number
  slug: string
  title: string
  seasonName: string
  premiership: string
  coverUrl: string
  publishedAt: Date | null
  updatedAt: Date
}

export type Yearbook = YearbookSummary & {
  presidentMessage: string
  coachMessage: string
  sponsorMessage: string
  /** The season summary, and whether it came from the AI draft button (shown with a note). */
  seasonSummary: string
  seasonSummaryAi: boolean
  photos: GalleryPhoto[]
  sponsors: Sponsor[]
}

const summary = (d: YearbookDoc): YearbookSummary => ({
  id: d.id,
  slug: d.slug ?? '',
  title: d.title,
  seasonName: d.seasonName,
  premiership: d.premiership ?? '',
  coverUrl: mediaUrl(d.cover),
  publishedAt: d.publishedAt ? new Date(d.publishedAt) : null,
  updatedAt: new Date(d.updatedAt),
})

/** Populated relationship entries only (an unpopulated id has no fields to show). */
const populated = <T extends object>(xs: (number | T)[] | null | undefined): T[] => (xs ?? []).filter((x): x is T => typeof x === 'object' && x !== null)

/** Published yearbooks, newest season first. Card fields only. */
export async function listPublishedYearbooks(): Promise<YearbookSummary[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'yearbooks',
    where: PUBLISHED,
    sort: '-seasonName',
    pagination: false,
    depth: 1,
    select: { slug: true, title: true, seasonName: true, premiership: true, cover: true, publishedAt: true, updatedAt: true },
  })
  return docs.map((d) => summary(d as YearbookDoc))
}

/** The full published yearbook for a slug, or null (draft, unknown, malformed). */
export async function getPublishedYearbookBySlug(slug: string): Promise<Yearbook | null> {
  if (typeof slug !== 'string' || !slug) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'yearbooks',
    where: { and: [{ slug: { equals: slug } }, PUBLISHED] },
    limit: 1,
    depth: 2,
  })
  const d = docs[0]
  if (!d) return null
  return {
    ...summary(d),
    presidentMessage: d.presidentMessage ?? '',
    coachMessage: d.coachMessage ?? '',
    sponsorMessage: d.sponsorMessage ?? '',
    seasonSummary: d.seasonSummary ?? '',
    seasonSummaryAi: Boolean(d.seasonSummaryAi) && Boolean(d.seasonSummary?.trim()),
    photos: populated(d.photos).map(toGalleryPhoto).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    sponsors: populated(d.featuredSponsors).map(toSponsor),
  }
}

/** `generateMetadata` read: title, season, cover and dates only. */
export async function getPublishedYearbookMeta(slug: string): Promise<YearbookSummary | null> {
  if (typeof slug !== 'string' || !slug) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'yearbooks',
    where: { and: [{ slug: { equals: slug } }, PUBLISHED] },
    limit: 1,
    depth: 1,
    select: { slug: true, title: true, seasonName: true, premiership: true, cover: true, publishedAt: true, updatedAt: true },
  })
  return docs[0] ? summary(docs[0] as YearbookDoc) : null
}

/** Sitemap read: slug and last-modified for published yearbooks. */
export async function listPublishedYearbookSlugs(): Promise<{ slug: string; updatedAt: Date }[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'yearbooks',
    where: PUBLISHED,
    pagination: false,
    depth: 0,
    select: { slug: true, updatedAt: true },
    sort: 'id',
  })
  return docs.filter((d) => d.slug).map((d) => ({ slug: d.slug as string, updatedAt: new Date(d.updatedAt) }))
}
