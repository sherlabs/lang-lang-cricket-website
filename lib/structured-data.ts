import type { Event, Story } from '@/lib/domain'
import { CLUB_TIMEZONE } from '@/config/site'
import { absoluteUrl } from './site-metadata'

const MELBOURNE = CLUB_TIMEZONE
const CONTEXT = 'https://schema.org'

type JsonLd = Record<string, unknown>

/** The club values JSON-LD needs (a `getClub()` result satisfies it). */
export type JsonLdClub = {
  name: string
  siteUrl: string
  sport: string
  email: string
  logoUrl: string
  address: { locality: string; region: string; country: string }
  ogImage: { url: string }
  sameAs: string[]
}

const clubRef = (club: JsonLdClub) => ({ '@type': 'SportsOrganization', name: club.name, url: club.siteUrl })

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

export function organizationJsonLd(club: JsonLdClub): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'SportsOrganization',
    name: club.name,
    url: club.siteUrl,
    logo: absoluteUrl(club.logoUrl, club.siteUrl),
    sport: club.sport,
    email: club.email,
    address: {
      '@type': 'PostalAddress',
      addressLocality: club.address.locality,
      addressRegion: club.address.region,
      addressCountry: club.address.country,
    },
    ...(club.sameAs.length ? { sameAs: club.sameAs } : {}),
  }
}

export function eventJsonLd(event: Event, occurrence: Date | null, club: JsonLdClub): JsonLd | null {
  if (!occurrence) return null
  const url = absoluteUrl(`/events/${event.id}`, club.siteUrl)
  const data: JsonLd = {
    '@context': CONTEXT,
    '@type': 'Event',
    name: event.title,
    startDate: melbourneIso(occurrence),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: [absoluteUrl(event.coverImageUrl || club.ogImage.url, club.siteUrl)],
    description: event.description || `${event.title} at ${club.name}.`,
    organizer: clubRef(club),
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

export function playerJsonLd(p: { slug: string; name: string; photoUrl?: string }, club: JsonLdClub): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'Person',
    name: p.name,
    url: absoluteUrl(`/players/${p.slug}`, club.siteUrl),
    ...(p.photoUrl ? { image: absoluteUrl(p.photoUrl, club.siteUrl) } : {}),
    memberOf: clubRef(club),
  }
}

export function storyJsonLd(
  story: Pick<Story, 'slug' | 'title' | 'coverImageUrl' | 'authorName' | 'publishedAt' | 'createdAt' | 'updatedAt'>,
  club: JsonLdClub,
): JsonLd {
  const published = story.publishedAt ?? story.createdAt
  // updatedAt (spec §14); never earlier than the publication date.
  const modified = story.updatedAt > published ? story.updatedAt : published
  return {
    '@context': CONTEXT,
    '@type': 'Article',
    headline: story.title,
    image: [absoluteUrl(story.coverImageUrl || club.ogImage.url, club.siteUrl)],
    datePublished: published.toISOString(),
    dateModified: modified.toISOString(),
    author: { '@type': 'Person', name: story.authorName },
    publisher: {
      '@type': 'SportsOrganization',
      name: club.name,
      url: club.siteUrl,
      logo: { '@type': 'ImageObject', url: absoluteUrl(club.logoUrl, club.siteUrl) },
    },
    mainEntityOfPage: absoluteUrl(`/history/${story.slug}`, club.siteUrl),
  }
}

/** BreadcrumbList for the stats pages. Relative hrefs are resolved against the club's site URL. */
export function breadcrumbJsonLd(items: { name: string; href: string }[], club: Pick<JsonLdClub, 'siteUrl'>): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: absoluteUrl(it.href, club.siteUrl) })),
  }
}

/** Ordered list of players for a leaderboard: names and profile URLs only, never the stat values. */
export function playerListJsonLd(name: string, players: { name: string; slug: string }[], club: Pick<JsonLdClub, 'siteUrl'>): JsonLd | null {
  if (!players.length) return null
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    name,
    itemListElement: players.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: { '@type': 'Person', name: p.name, url: absoluteUrl(`/players/${p.slug}`, club.siteUrl) },
    })),
  }
}

/** A season yearbook as a CreativeWork: title, season and the date it was published; never the stats. */
export function yearbookJsonLd(
  book: { slug: string; title: string; seasonName: string; coverUrl: string; publishedAt: Date | null; updatedAt: Date },
  club: JsonLdClub,
): JsonLd {
  const published = book.publishedAt ?? book.updatedAt
  const modified = book.updatedAt > published ? book.updatedAt : published
  return {
    '@context': CONTEXT,
    '@type': 'CreativeWork',
    name: book.title,
    headline: book.title,
    about: book.seasonName,
    image: [absoluteUrl(book.coverUrl || club.ogImage.url, club.siteUrl)],
    datePublished: published.toISOString(),
    dateModified: modified.toISOString(),
    publisher: { '@type': 'SportsOrganization', name: club.name, url: club.siteUrl, logo: { '@type': 'ImageObject', url: absoluteUrl(club.logoUrl, club.siteUrl) } },
    mainEntityOfPage: absoluteUrl(`/yearbooks/${book.slug}`, club.siteUrl),
  }
}
