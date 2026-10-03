import type { Payload } from 'payload'

export type PendingCounts = { stories: number; photos: number; total: number }

/** Things members sent in that are waiting for a committee decision. Never throws. */
export async function getPendingCounts(payload: Payload): Promise<PendingCounts> {
  const count = async (collection: 'stories' | 'event-photos') => {
    try {
      const { totalDocs } = await payload.count({ collection, where: { status: { equals: 'pending' } }, overrideAccess: true })
      return totalDocs
    } catch {
      return 0
    }
  }
  const [stories, photos] = await Promise.all([count('stories'), count('event-photos')])
  return { stories, photos, total: stories + photos }
}
