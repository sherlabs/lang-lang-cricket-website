import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

/**
 * Spec §14 / A8: the sitemap states its own public filters (the Local API runs with
 * overrideAccess), and the events and players queries pass `joins: false` so RSVPs and pending photos
 * are never loaded.
 */
let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))
vi.mock('@/lib/club', () => ({ getClub: async () => ({ siteUrl: 'https://club.test' }) }))

beforeEach(() => {
  fake = createPayloadFake({
    players: [
      { id: 1, slug: 'pat', hidden: false, updatedAt: '2026-02-01T00:00:00.000Z' },
      { id: 2, slug: 'secret', hidden: true, updatedAt: '2026-02-02T00:00:00.000Z' },
    ],
    yearbooks: [
      { id: 1, slug: 'summer-2025-26', status: 'published', updatedAt: '2026-04-01T00:00:00.000Z' },
      { id: 2, slug: 'summer-2024-25-draft', status: 'draft', updatedAt: '2026-04-02T00:00:00.000Z' },
    ],
    events: [{ id: 7, createdAt: '2025-12-01T00:00:00.000Z' }],
    pages: [
      { id: 1, slug: 'about-the-club', status: 'published', updatedAt: '2026-05-01T00:00:00.000Z' },
      { id: 2, slug: 'draft-season-plan', status: 'draft', updatedAt: '2026-05-02T00:00:00.000Z' },
    ],
    news: [
      { id: 1, slug: 'launch-bbq', status: 'published', publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 2, slug: 'draft-post', status: 'draft', publishedAt: null, updatedAt: '2026-01-03T00:00:00.000Z' },
      { id: 3, slug: 'scheduled-post', status: 'published', publishedAt: '2999-01-01T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' },
    ],
    stories: [
      { id: 1, slug: 'first-win', status: 'published', updatedAt: '2026-03-01T00:00:00.000Z' },
      { id: 2, slug: 'pending-one', status: 'pending', updatedAt: '2026-03-02T00:00:00.000Z' },
    ],
  })
})

describe('sitemap', () => {
  it('includes the honour board and leaves the compare tool out', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls).toContain('https://club.test/honours')
    expect(urls.some((u) => u.includes('/players/compare'))).toBe(false)
  })

  it('lists the new stats routes and leaves the export out', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const urls = (await sitemap()).map((e) => e.url)
    for (const p of ['/stats', '/records', '/honours', '/yearbooks', '/matches', '/statlab']) expect(urls).toContain(`https://club.test${p}`)
    expect(urls.some((u) => u.includes('/statlab/export'))).toBe(false)
  })

  it('lists only published yearbooks (its own where), with lastModified = updatedAt', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const calls = fake.callsTo('find', 'yearbooks')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({ where: { status: { equals: 'published' } }, depth: 0, pagination: false })
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://club.test/yearbooks/summer-2025-26')
    expect(urls).not.toContain('https://club.test/yearbooks/summer-2024-25-draft')
    expect(entries.find((e) => e.url === 'https://club.test/yearbooks/summer-2025-26')?.lastModified).toEqual(new Date('2026-04-01T00:00:00.000Z'))
  })

  it('lists only players that are not hidden (its own where, joins:false), with lastModified = updatedAt', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const calls = fake.callsTo('find', 'players')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({ where: { hidden: { equals: false } }, joins: false, depth: 0, pagination: false, select: { slug: true, updatedAt: true } })
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://club.test/players/pat')
    expect(urls).not.toContain('https://club.test/players/secret')
    expect(entries.find((e) => e.url === 'https://club.test/players/pat')?.lastModified).toEqual(new Date('2026-02-01T00:00:00.000Z'))
  })

  it('lists only published stories (its own where), with lastModified = updatedAt', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const calls = fake.callsTo('find', 'stories')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({ where: { status: { equals: 'published' } }, depth: 0, pagination: false, select: { slug: true, updatedAt: true } })
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://club.test/history/first-win')
    expect(urls).not.toContain('https://club.test/history/pending-one')
    expect(entries.find((e) => e.url === 'https://club.test/history/first-win')?.lastModified).toEqual(new Date('2026-03-01T00:00:00.000Z'))
  })

  it('reads events with joins:false and a narrow select', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const calls = fake.callsTo('find', 'events')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({ joins: false, depth: 0, pagination: false, select: { createdAt: true } })
    expect(entries.find((e) => e.url === 'https://club.test/events/7')?.lastModified).toEqual(new Date('2025-12-01T00:00:00.000Z'))
  })

  it('lists the stats and records pages', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const byUrl = new Map(entries.map((e) => [e.url, e]))
    expect(byUrl.get('https://club.test/stats')).toMatchObject({ changeFrequency: 'weekly', priority: 0.7 })
    expect(byUrl.get('https://club.test/records')).toMatchObject({ changeFrequency: 'weekly', priority: 0.6 })
  })

  it('lists the news feed, published pages and visible news posts only (own filters), with lastModified = updatedAt', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://club.test/news')
    expect(urls).toContain('https://club.test/info/about-the-club')
    expect(urls).not.toContain('https://club.test/info/draft-season-plan')
    expect(urls).toContain('https://club.test/news/launch-bbq')
    expect(urls).not.toContain('https://club.test/news/draft-post')
    expect(urls).not.toContain('https://club.test/news/scheduled-post')
    expect(fake.callsTo('find', 'pages')[0].args).toMatchObject({ where: { status: { equals: 'published' } }, depth: 0, pagination: false })
    const newsWhere = fake.callsTo('find', 'news')[0].args.where as { and: unknown[] }
    expect(newsWhere.and[0]).toEqual({ status: { equals: 'published' } })
    expect(JSON.stringify(newsWhere.and[1])).toContain('less_than_equal')
    expect(entries.find((e) => e.url === 'https://club.test/info/about-the-club')?.lastModified).toEqual(new Date('2026-05-01T00:00:00.000Z'))
    expect(entries.find((e) => e.url === 'https://club.test/news/launch-bbq')?.lastModified).toEqual(new Date('2026-01-02T00:00:00.000Z'))
  })
})
