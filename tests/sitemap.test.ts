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
  fake = createPayloadFake({
    events: [{ id: 7, createdAt: '2025-12-01T00:00:00.000Z' }],
    stories: [
      { id: 1, slug: 'first-win', status: 'published', updatedAt: '2026-03-01T00:00:00.000Z' },
      { id: 2, slug: 'pending-one', status: 'pending', updatedAt: '2026-03-02T00:00:00.000Z' },
    ],
  })
})

describe('sitemap', () => {
  it('keeps the players filter and lists their pages', async () => {
    const { default: sitemap } = await import('@/app/sitemap')
    const entries = await sitemap()
    expect(selects).toEqual([{ table: 'players', where: { col: 'hidden', val: false } }])
    expect(entries.map((e) => e.url)).toContain('https://club.test/players/pat')
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
})
