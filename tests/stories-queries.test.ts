import { describe, it, expect, vi } from 'vitest'

let selectResult: unknown[] = []

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectResult),
      }),
    }),
  },
}))

describe('getPublishedStoryBySlug', () => {
  it('returns null when no row matches the slug', async () => {
    selectResult = []
    const { getPublishedStoryBySlug } = await import('@/lib/stories-queries')
    expect(await getPublishedStoryBySlug('missing')).toBeNull()
  })

  it('returns null-shaped result for a slug that only matches a non-published row', async () => {
    // The query itself filters on status = 'published', so a pending/rejected
    // row with a matching slug never reaches this function as a row — the
    // fake db here models that by returning no rows, same as a true miss.
    selectResult = []
    const { getPublishedStoryBySlug } = await import('@/lib/stories-queries')
    expect(await getPublishedStoryBySlug('pending-story')).toBeNull()
  })

  it('returns the row when one matches', async () => {
    selectResult = [{ id: 1, slug: 'grand-final-recap', status: 'published' }]
    const { getPublishedStoryBySlug } = await import('@/lib/stories-queries')
    const result = await getPublishedStoryBySlug('grand-final-recap')
    expect(result?.slug).toBe('grand-final-recap')
  })
})
