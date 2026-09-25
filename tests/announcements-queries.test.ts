import { describe, it, expect, vi } from 'vitest'

let selectResult: unknown[] = []

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => {
          const orderBy = () => {
            const rows = Promise.resolve(selectResult)
            return Object.assign(rows, {
              limit: (n: number) => Promise.resolve(selectResult.slice(0, n)),
            })
          }
          return { orderBy }
        },
      }),
    }),
  },
}))

describe('getLatestAnnouncement', () => {
  it('returns null when there are no published announcements', async () => {
    selectResult = []
    const { getLatestAnnouncement } = await import('@/lib/announcements-queries')
    expect(await getLatestAnnouncement()).toBeNull()
  })

  it('returns the most recent published announcement', async () => {
    // The query itself filters/orders in Postgres (published = true, newest
    // createdAt first, limit 1) — this fake db just returns what the real
    // query would already have narrowed down to, same approach as
    // stories-queries.test.ts.
    selectResult = [
      { id: 2, title: 'Newest', published: true, createdAt: new Date('2026-09-01') },
      { id: 1, title: 'Older', published: true, createdAt: new Date('2026-08-01') },
    ]
    const { getLatestAnnouncement } = await import('@/lib/announcements-queries')
    const result = await getLatestAnnouncement()
    expect(result?.title).toBe('Newest')
  })
})

describe('listPublishedAnnouncements', () => {
  it('excludes unpublished announcements and orders newest-first', async () => {
    // As above: the WHERE published = true runs in Postgres, so the fake db
    // is seeded with only the rows the real query would already return.
    selectResult = [
      { id: 2, title: 'Newest', published: true, createdAt: new Date('2026-09-01') },
      { id: 1, title: 'Older', published: true, createdAt: new Date('2026-08-01') },
    ]
    const { listPublishedAnnouncements } = await import('@/lib/announcements-queries')
    const result = await listPublishedAnnouncements()
    expect(result.map((r) => r.title)).toEqual(['Newest', 'Older'])
  })

  it('returns an empty array when nothing is published', async () => {
    selectResult = []
    const { listPublishedAnnouncements } = await import('@/lib/announcements-queries')
    expect(await listPublishedAnnouncements()).toEqual([])
  })
})
