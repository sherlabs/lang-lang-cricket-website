import type { MetadataRoute } from 'next'
import { getClub } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'

export const dynamic = 'force-dynamic' // DB-backed (Payload Local API): revalidate=3600 would bake a static-only sitemap at build

type Entry = MetadataRoute.Sitemap[number]

const STATIC: { path: string; changeFrequency: Entry['changeFrequency']; priority: number }[] = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/fixtures', changeFrequency: 'daily', priority: 0.9 },
  { path: '/events', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/players', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/stats', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/records', changeFrequency: 'weekly', priority: 0.6 },
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
    const payload = await getPayloadClient()
    const [playerRows, storyRows, eventRows] = await Promise.all([
      // Public filter stated here (the Local API runs with overrideAccess): not hidden.
      payload
        .find({
          collection: 'players',
          where: { hidden: { equals: false } },
          pagination: false,
          depth: 0,
          joins: false,
          select: { slug: true, updatedAt: true },
          sort: 'id',
        })
        .then((r) => r.docs.map((d) => ({ slug: d.slug, updatedAt: new Date(d.updatedAt) }))),
      // Public filter stated here (the Local API runs with overrideAccess): published only.
      payload
        .find({
          collection: 'stories',
          where: { status: { equals: 'published' } },
          pagination: false,
          depth: 0,
          select: { slug: true, updatedAt: true },
          sort: 'id',
        })
        .then((r) => r.docs.map((d) => ({ slug: d.slug, updatedAt: new Date(d.updatedAt) }))),
      // Events have no draft/visible flag: every row is public. joins:false — the Local API
      // runs with overrideAccess and the rsvps/photos joins would otherwise be loaded.
      payload
        .find({ collection: 'events', pagination: false, depth: 0, joins: false, select: { createdAt: true }, sort: 'id' })
        .then((r) => r.docs.map((d) => ({ id: d.id, createdAt: new Date(d.createdAt) }))),
    ])
    for (const p of playerRows) {
      entries.push({ url: `${SITE_URL}/players/${p.slug}`, lastModified: p.updatedAt, changeFrequency: 'monthly', priority: 0.5 })
    }
    for (const s of storyRows) {
      entries.push({
        url: `${SITE_URL}/history/${s.slug}`,
        lastModified: s.updatedAt,
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
