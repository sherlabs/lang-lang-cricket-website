import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { stories, type Story } from '@/db/schema'

export async function listPublishedStories(): Promise<Story[]> {
  return db.select().from(stories).where(eq(stories.status, 'published')).orderBy(desc(stories.publishedAt))
}

export async function getPublishedStoryBySlug(slug: string): Promise<Story | null> {
  const rows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.slug, slug), eq(stories.status, 'published')))
  return (rows[0] as Story | undefined) ?? null
}
