import type { MetadataRoute } from 'next'
import { getClub } from '@/lib/club'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const SITE_URL = (await getClub()).siteUrl
  return {
    rules: [
      {
        userAgent: '*',
        // `/api/public/players/` is allowed explicitly (longest match beats `/api`) so share-card
        // fetchers and crawlers can load the player stat cards.
        allow: ['/', '/api/public/players/'],
        disallow: ['/admin', '/api', '/history/drafts/', '/events/rsvp/', '/events/*/rsvp', '/players/compare$', '/players/compare?', '/statlab/export', '/preview'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
