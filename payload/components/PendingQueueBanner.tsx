import type { BeforeListServerProps, CollectionSlug } from 'payload'

/**
 * `beforeList` on moderated collections (event photos and stories; spec §9): when
 * anything is waiting for review, "N awaiting review — Show pending" linking to the list
 * filtered to `status = pending`.
 */
export async function PendingQueueBanner({ payload, collectionSlug }: BeforeListServerProps) {
  let pending = 0
  try {
    ;({ totalDocs: pending } = await payload.count({
      collection: collectionSlug as CollectionSlug,
      where: { status: { equals: 'pending' } },
      overrideAccess: true,
    }))
  } catch {
    return null
  }
  if (!pending) return null
  const href = `${payload.config.routes.admin}/collections/${collectionSlug}?where[status][equals]=pending`
  return (
    <div className="club-queue-banner" role="status">
      <strong>{pending}</strong> waiting for approval —{' '}
      <a href={href}>Show them</a>
    </div>
  )
}
