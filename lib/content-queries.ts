import 'server-only'
import type { DocumentItem, GalleryPhoto, Sponsor } from '@/lib/domain'
import { getPayloadClient } from '@/lib/payload/client'
import { toDocumentItem, toGalleryPhoto, toSponsor } from '@/lib/payload/mappers'

/**
 * Public reads for the simple content collections (spec §14). Every query states its own
 * filters and ordering: the Local API runs with overrideAccess. Ties fall back to `id`,
 * which is the legacy tables' effective order.
 */

/** All sponsors, in `sortOrder` then id order (pages group them by tier). */
export async function listSponsors(): Promise<Sponsor[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'sponsors', sort: ['sortOrder', 'id'], pagination: false, depth: 1 })
  return docs.map(toSponsor)
}

/** Gallery photos, lowest `sortOrder` first; `limit` for the home page teaser. */
export async function listGalleryPhotos(limit?: number): Promise<GalleryPhoto[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'gallery-photos',
    sort: ['sortOrder', 'id'],
    depth: 0,
    ...(limit ? { limit, pagination: true } : { pagination: false }),
  })
  return docs.map(toGalleryPhoto)
}

/** The newest gallery upload (by createdAt, not sortOrder) — the /gallery share image. */
export async function getGalleryOgPhoto(): Promise<GalleryPhoto | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'gallery-photos', sort: ['-createdAt', '-id'], limit: 1, depth: 0 })
  return docs[0] ? toGalleryPhoto(docs[0]) : null
}

/** Documents by title (the page groups them by category). */
export async function listDocuments(): Promise<DocumentItem[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'documents', sort: ['title', 'id'], pagination: false, depth: 0 })
  return docs.map(toDocumentItem)
}
