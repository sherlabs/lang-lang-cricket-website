import type { MetadataRoute } from 'next'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, players, stories } from '@/db/schema'
import { getClub } from '@/lib/club'

export const dynamic = 'force-dynamic' // DB-backed; revalidate=3600 would bake a static-only sitemap at build (Neon fetches are no-store)

type Entry = MetadataRoute.Sitemap[number]

const STATIC: { path: string; changeFrequency: Entry['changeFrequency']; priority: number }[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/fixtures', changeFrequency: 'daily', priority: 0.9 },
  { path: '/events', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/players', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/history', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/history/submit', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/people', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/announcements', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/gallery', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/sponsors', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/documents', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/contact', changeFrequency: 'yearly', priority: 0.6 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const SITE_URL = (await getClub()).siteUrl
  const entries: MetadataRoute.Sitemap = STATIC.map((s) => ({
    url: `${SITE_URL}${s.path}`,
    changeFrequency: s.changeFrequency,
    priority: s.priority,
  }))

  try {
    const [playerRows, storyRows, eventRows] = await Promise.all([
      db.select({ slug: players.slug, updatedAt: players.updatedAt }).from(players).where(eq(players.hidden, false)),
      db
        .select({ slug: stories.slug, publishedAt: stories.publishedAt, reviewedAt: stories.reviewedAt, createdAt: stories.createdAt })
        .from(stories)
        .where(eq(stories.status, 'published')),
      // Events have no draft/visible flag: every row is public.
      db.select({ id: events.id, createdAt: events.createdAt }).from(events),
    ])
    for (const p of playerRows) {
      entries.push({ url: `${SITE_URL}/players/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.5 })
    }
    for (const s of storyRows) {
      entries.push({
        url: `${SITE_URL}/history/${s.slug}`,
        lastModified: s.reviewedAt ?? s.publishedAt ?? s.createdAt,
        changeFrequency: 'yearly',
        priority: 0.5,
      })
    }
    for (const e of eventRows) {
      entries.push({ url: `${SITE_URL}/events/${e.id}`, lastModified: e.createdAt, changeFrequency: 'weekly', priority: 0.6 })
    }
  } catch (err) {
    console.error('sitemap: dynamic entries failed, returning static only', err)
  }
  return entries
}
