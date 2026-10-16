import 'server-only'
import type { Announcement } from '@/lib/domain'
import { getPayloadClient } from '@/lib/payload/client'
import { toAnnouncement } from '@/lib/payload/mappers'

export type { Announcement } from '@/lib/domain'

/** Public filter: the Local API runs with overrideAccess, so the query states it. */
const PUBLISHED = { published: { equals: true } } as const

/** Most recently created published announcement, or null if none — feeds the homepage banner. */
export async function getLatestAnnouncement(): Promise<Announcement | null> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'announcements', where: PUBLISHED, sort: ['-createdAt', '-id'], limit: 1, depth: 0 })
  return docs[0] ? toAnnouncement(docs[0]) : null
}

/** All published announcements, newest first — feeds the /announcements list page. */
export async function listPublishedAnnouncements(): Promise<Announcement[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'announcements',
    where: PUBLISHED,
    sort: ['-createdAt', '-id'],
    pagination: false,
    depth: 0,
  })
  return docs.map(toAnnouncement)
}
