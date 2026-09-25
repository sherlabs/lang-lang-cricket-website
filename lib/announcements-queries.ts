import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { announcements, type Announcement } from '@/db/schema'

/** Most recently created published announcement, or null if none — feeds the homepage banner. */
export async function getLatestAnnouncement(): Promise<Announcement | null> {
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.published, true))
    .orderBy(desc(announcements.createdAt))
    .limit(1)
  return (rows[0] as Announcement | undefined) ?? null
}

/** All published announcements, newest first — feeds the /announcements list page. */
export async function listPublishedAnnouncements(): Promise<Announcement[]> {
  return db
    .select()
    .from(announcements)
    .where(eq(announcements.published, true))
    .orderBy(desc(announcements.createdAt))
}
