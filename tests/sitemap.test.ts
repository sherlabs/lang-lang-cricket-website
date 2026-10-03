import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

/**
 * Spec §14 / A8: the sitemap states its own public filters (the Local API runs with
 * overrideAccess), and the events query passes `joins: false` so RSVPs and pending photos
 * are never loaded.
 */
let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))
vi.mock('@/lib/club', () => ({ getClub: async () => ({ siteUrl: 'https://club.test' }) }))

// drizzle `eq` → a plain record, so the where clauses can be asserted without SQL objects.
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (col: { name: string }, val: unknown) => ({ col: col.name, val }),
}))

type Select = { table: string; where: unknown }
const selects: Select[] = []
const ROWS: Record<string, unknown[]> = {
  players: [{ slug: 'pat', updatedAt: new Date('2026-02-01T00:00:00.000Z') }],
  stories: [{ slug: 'first-win', publishedAt: null, reviewedAt: new Date('2026-03-01T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z') }],
}
vi.mock('@/db', async () => {
  const { getTableName } = await import('drizzle-orm')
  return {
    db: {
      select: () => ({
        from: (table: Parameters<typeof getTableName>[0]) => ({
          where: (where: unknown) => {
            const name = getTableName(table)
            selects.push({ table: name, where })
            return Promise.resolve(ROWS[name] ?? [])
          },
        }),
      }),
    },
  }
})

beforeEach(() => {
  selects.length = 0
  fake = createPayloadFake({ events: [{ id: 7, createdAt: '2025-12-01T00:00:00.000Z' }] })
})

describe('sitemap', () => {
  it('keeps the players and stories filters and lists their pages', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    expect(selects).toEqual(
      expect.arrayContaining([
        { table: 'players', where: { col: 'hidden', val: false } },
        { table: 'stories', where: { col: 'status', val: 'published' } },
      ]),
    )
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://club.test/players/pat')
    expect(urls).toContain('https://club.test/history/first-win')
  })

  it('reads events with joins:false and a narrow select', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    const calls = fake.callsTo('find', 'events')
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toMatchObject({ joins: false, depth: 0, pagination: false, select: { createdAt: true } })
    expect(entries.find((e) => e.url === 'https://club.test/events/7')?.lastModified).toEqual(new Date('2025-12-01T00:00:00.000Z'))
  })
})
