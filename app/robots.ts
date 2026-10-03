import type { MetadataRoute } from 'next'
import { getClub } from '@/lib/club'

export const dynamic = 'force-dynamic'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const SITE_URL = (await getClub()).siteUrl
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/history/drafts/', '/events/rsvp/', '/events/*/rsvp'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
