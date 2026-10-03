/* eslint-disable @typescript-eslint/no-explicit-any -- fixtures cast partial rows; retyped in WP2 (spec §15 ADAPT) */
import { describe, expect, it } from 'vitest'
import type { Event } from '@/lib/domain'
import { resolveClub } from '@/lib/club-merge'
import { breadcrumbJsonLd, eventJsonLd, melbourneIso, organizationJsonLd, playerJsonLd, playerListJsonLd, serializeJsonLd, storyJsonLd, yearbookJsonLd } from '@/lib/structured-data'

// The unseeded club (defaults module) — the values pages pass in before `seed:club`.
const club = resolveClub(null)

const baseEvent = {
  id: 7, type: 'one_time', title: 'Presentation Night', description: 'Awards', location: 'Lang Lang Clubrooms',
  coverImageUrl: '', paymentLinkLabel: '', paymentLinkUrl: '', mealOptions: [], eventTime: '18:30',
  eventDate: null, dayOfWeek: null, startDate: null, endDate: null, createdAt: new Date(), updatedAt: new Date(),
} as Event

describe('melbourneIso', () => {
  it('uses +11:00 during daylight saving', () => {
    expect(melbourneIso(new Date(Date.UTC(2026, 0, 15, 18, 30)))).toBe('2026-01-15T18:30:00+11:00')
  })
  it('uses +10:00 in winter', () => {
    expect(melbourneIso(new Date(Date.UTC(2026, 6, 15, 9, 5)))).toBe('2026-07-15T09:05:00+10:00')
  })
  it('handles the DST changeover day (starts 2026-10-04 at 02:00)', () => {
    expect(melbourneIso(new Date(Date.UTC(2026, 9, 4, 1, 0)))).toBe('2026-10-04T01:00:00+10:00')
    expect(melbourneIso(new Date(Date.UTC(2026, 9, 4, 12, 0)))).toBe('2026-10-04T12:00:00+11:00')
  })
})

describe('json-ld builders', () => {
  it('organization has absolute logo and address', () => {
    const o = organizationJsonLd(club) as any
    expect(o['@type']).toBe('SportsOrganization')
    expect(o.logo).toBe('https://langlangcricketclub.com/assets/branding/logo.png')
    expect(o.address.addressLocality).toBe('Caldermeade')
    expect(o.email).toBe('langlangcricketclub@gmail.com')
    // No social URL yet → no sameAs (unchanged output).
    expect(o.sameAs).toBeUndefined()
  })
  it('organization uses the saved club values and lists social URLs as sameAs', () => {
    const saved = resolveClub({
      updatedAt: '2026-10-01T00:00:00.000Z',
      name: 'Test CC',
      siteUrl: 'https://test.example/',
      socials: [
        { platform: 'facebook', url: 'https://facebook.com/testcc', label: 'Facebook' },
        { platform: 'instagram', url: '', label: '' },
      ],
    })
    const o = organizationJsonLd(saved) as any
    expect(o.name).toBe('Test CC')
    expect(o.url).toBe('https://test.example')
    expect(o.logo).toBe('https://test.example/assets/branding/logo.png')
    expect(o.sameAs).toEqual(['https://facebook.com/testcc'])
  })
  it('event: Melbourne offset, absolute urls, default image, no offers without payment link', () => {
    const e = eventJsonLd(baseEvent, new Date(Date.UTC(2026, 10, 20, 18, 30)), club) as any
    expect(e['@type']).toBe('Event')
    expect(e.startDate).toBe('2026-11-20T18:30:00+11:00')
    expect(e.url).toBe('https://langlangcricketclub.com/events/7')
    expect(e.image[0]).toBe('https://langlangcricketclub.com/og-image.jpg')
    expect(e.location.name).toBe('Lang Lang Clubrooms')
    expect(e.offers).toBeUndefined()
  })
  it('event: offers only with payment link; null without an occurrence', () => {
    const e = eventJsonLd({ ...baseEvent, paymentLinkUrl: 'https://pay.example/x', coverImageUrl: 'https://blob.example/c.jpg' }, new Date(Date.UTC(2026, 6, 1, 12, 0)), club) as any
    expect(e.offers).toMatchObject({ '@type': 'Offer', url: 'https://pay.example/x', availability: 'https://schema.org/InStock' })
    expect(e.offers.price).toBeUndefined()
    expect(e.image[0]).toBe('https://blob.example/c.jpg')
    expect(eventJsonLd(baseEvent, null, club)).toBeNull()
  })
  it('player: Person with absolute url, image only when photo', () => {
    const p = playerJsonLd({ slug: 'jo-bloggs', name: 'Jo Bloggs', photoUrl: '/p.jpg' }, club) as any
    expect(p['@type']).toBe('Person')
    expect(p.url).toBe('https://langlangcricketclub.com/players/jo-bloggs')
    expect(p.image).toBe('https://langlangcricketclub.com/p.jpg')
    expect((playerJsonLd({ slug: 'a', name: 'A' }, club) as any).image).toBeUndefined()
  })
  it('story: Article with ISO dates and publisher', () => {
    const d = new Date('2026-03-01T00:00:00Z')
    const s = storyJsonLd({ slug: 'x', title: 'T', coverImageUrl: '', authorName: 'Ann', publishedAt: d, createdAt: d, updatedAt: d }, club) as any
    expect(s['@type']).toBe('Article')
    expect(s.datePublished).toBe(d.toISOString())
    expect(s.author).toEqual({ '@type': 'Person', name: 'Ann' })
    expect(s.publisher.name).toBe('Lang Lang Cricket Club')
    expect(s.mainEntityOfPage).toBe('https://langlangcricketclub.com/history/x')
  })
  it('story: dateModified comes from updatedAt, never before datePublished', () => {
    const pub = new Date('2026-03-03T04:00:00Z')
    const later = new Date('2026-05-01T00:00:00Z')
    const base = { slug: 'x', title: 'T', coverImageUrl: '', authorName: 'Ann', publishedAt: pub, createdAt: new Date('2026-03-01T00:00:00Z') }
    expect((storyJsonLd({ ...base, updatedAt: later }, club) as any).dateModified).toBe(later.toISOString())
    expect((storyJsonLd({ ...base, updatedAt: new Date('2026-03-01T00:00:00Z') }, club) as any).dateModified).toBe(pub.toISOString())
  })
  it('serializeJsonLd escapes < and round-trips', () => {
    const out = serializeJsonLd({ a: '</script><b>' })
    expect(out).not.toContain('<')
    expect(JSON.parse(out).a).toBe('</script><b>')
  })

  it('breadcrumbs: ordered ListItems with absolute URLs', () => {
    const b = breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }], club) as any
    expect(b['@type']).toBe('BreadcrumbList')
    expect(b.itemListElement.map((i: any) => [i.position, i.name, i.item])).toEqual([
      [1, 'Home', 'https://langlangcricketclub.com/'],
      [2, 'Stats', 'https://langlangcricketclub.com/stats'],
    ])
  })
  it('leaderboard ItemList: Person names and urls only, null when empty', () => {
    const l = playerListJsonLd('Runs leaders', [{ name: 'Pat Lee', slug: 'pat-lee' }], club) as any
    expect(l['@type']).toBe('ItemList')
    expect(l.itemListElement[0]).toEqual({ '@type': 'ListItem', position: 1, item: { '@type': 'Person', name: 'Pat Lee', url: 'https://langlangcricketclub.com/players/pat-lee' } })
    expect(playerListJsonLd('x', [], club)).toBeNull()
  })
})

describe('yearbookJsonLd', () => {
  const pub = new Date('2026-04-01T00:00:00Z')
  const book = { slug: 'summer-2025-26', title: '2025/26 Yearbook', seasonName: 'Summer 2025/26', coverUrl: '', publishedAt: pub, updatedAt: pub }
  it('is a CreativeWork with absolute urls, the publication date and the club as publisher', () => {
    const j = yearbookJsonLd(book, club) as any
    expect(j['@type']).toBe('CreativeWork')
    expect(j.datePublished).toBe(pub.toISOString())
    expect(j.mainEntityOfPage).toBe(`${club.siteUrl}/yearbooks/summer-2025-26`)
    expect(j.image[0]).toBe(club.ogImage.url.startsWith('http') ? club.ogImage.url : `${club.siteUrl}${club.ogImage.url}`)
    expect(j.publisher.name).toBe(club.name)
  })
  it('falls back to updatedAt when never stamped, and dateModified is never earlier than datePublished', () => {
    const later = new Date('2026-05-01T00:00:00Z')
    const j = yearbookJsonLd({ ...book, publishedAt: null, updatedAt: later }, club) as any
    expect(j.datePublished).toBe(later.toISOString())
    expect((yearbookJsonLd({ ...book, updatedAt: new Date('2026-03-01T00:00:00Z') }, club) as any).dateModified).toBe(pub.toISOString())
  })
  it('carries no statistics', () => {
    expect(JSON.stringify(yearbookJsonLd(book, club))).not.toMatch(/runs|wickets|catches/i)
  })
})
