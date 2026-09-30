import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-metadata'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/history/drafts/', '/events/rsvp/', '/events/*/rsvp'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
