import type { Event, Story } from '@/db/schema'
import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from './site-metadata'

export const CLUB_EMAIL = 'langlangcricketclub@gmail.com'
const MELBOURNE = 'Australia/Melbourne'
const CONTEXT = 'https://schema.org'

type JsonLd = Record<string, unknown>

const clubRef = () => ({ '@type': 'SportsOrganization', name: SITE_NAME, url: SITE_URL })

function offsetMs(instant: Date): number {
  const p = new Intl.DateTimeFormat('en-AU', {
    timeZone: MELBOURNE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(instant)
  const g = (t: Intl.DateTimeFormatPartTypes) => Number(p.find((x) => x.type === t)?.value)
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'))
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * Event dates are Melbourne wall-clock values stored as UTC (see lib/event-occurrences.ts).
 * Returns ISO 8601 with the correct Melbourne offset for that wall-clock moment (+10:00 / +11:00).
 */
export function melbourneIso(wall: Date): string {
  const first = new Date(wall.getTime() - offsetMs(wall))
  const off = offsetMs(first)
  const mins = Math.round(off / 60000)
  const sign = mins < 0 ? '-' : '+'
  const abs = Math.abs(mins)
  const pad = (n: number) => String(n).padStart(2, '0')
  const local = wall.toISOString().slice(0, 16) // YYYY-MM-DDTHH:mm — wall-clock parts
  return `${local}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** Serialise for a <script type="application/ld+json">; `<` is escaped so content can't close the tag. */
export function serializeJsonLd(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

export function organizationJsonLd(): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'SportsOrganization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl('/assets/branding/logo.png'),
    sport: 'Cricket',
    email: CLUB_EMAIL,
    address: { '@type': 'PostalAddress', addressLocality: 'Caldermeade', addressRegion: 'VIC', addressCountry: 'AU' },
  }
}

export function eventJsonLd(event: Event, occurrence: Date | null): JsonLd | null {
  if (!occurrence) return null
  const url = absoluteUrl(`/events/${event.id}`)
  const data: JsonLd = {
    '@context': CONTEXT,
    '@type': 'Event',
    name: event.title,
    startDate: melbourneIso(occurrence),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [absoluteUrl(event.coverImageUrl || DEFAULT_OG_IMAGE.url)],
    description: event.description || `${event.title} at ${SITE_NAME}.`,
    organizer: clubRef(),
    url,
  }
  if (event.location) {
    data.location = { '@type': 'Place', name: event.location, address: event.location }
  }
  if (event.paymentLinkUrl) {
    data.offers = { '@type': 'Offer', url: event.paymentLinkUrl, availability: 'https://schema.org/InStock' }
  }
  return data
}

export function playerJsonLd(p: { slug: string; name: string; photoUrl?: string }): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'Person',
    name: p.name,
    url: absoluteUrl(`/players/${p.slug}`),
    ...(p.photoUrl ? { image: absoluteUrl(p.photoUrl) } : {}),
    memberOf: clubRef(),
  }
}

export function storyJsonLd(story: Pick<Story, 'slug' | 'title' | 'coverImageUrl' | 'authorName' | 'publishedAt' | 'reviewedAt' | 'createdAt'>): JsonLd {
  const published = story.publishedAt ?? story.createdAt
  const modified = story.reviewedAt ?? published
  return {
    '@context': CONTEXT,
    '@type': 'Article',
    headline: story.title,
    image: [absoluteUrl(story.coverImageUrl || DEFAULT_OG_IMAGE.url)],
    datePublished: published.toISOString(),
    dateModified: modified.toISOString(),
    author: { '@type': 'Person', name: story.authorName },
    publisher: { '@type': 'SportsOrganization', name: SITE_NAME, url: SITE_URL, logo: { '@type': 'ImageObject', url: absoluteUrl('/assets/branding/logo.png') } },
    mainEntityOfPage: absoluteUrl(`/history/${story.slug}`),
  }
}
