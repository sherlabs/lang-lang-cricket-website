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
    events: [{ id: 7, createdAt: '2025-12-01T00:00:00.000Z' }],
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
})
