import { describe, it, expect, vi } from 'vitest'

let eventRows: unknown[] = []

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(eventRows), orderBy: () => Promise.resolve(eventRows) }) }),
  },
}))

describe('listUpcomingItems', () => {
  it('includes a future one-time event as a single item', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    eventRows = [
      { id: 1, type: 'one_time', eventDate: future, eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
    ]
    const { listUpcomingItems } = await import('@/lib/events-queries')
    const items = await listUpcomingItems()
    expect(items).toHaveLength(1)
    expect(items[0].event.id).toBe(1)
  })

  it('excludes a past one-time event', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    eventRows = [
      { id: 2, type: 'one_time', eventDate: past, eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
    ]
    const { listUpcomingItems } = await import('@/lib/events-queries')
    expect(await listUpcomingItems()).toEqual([])
  })

  it('expands an active recurring event into multiple upcoming items', async () => {
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000) // started yesterday
    const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // ends in 90 days
    eventRows = [
      { id: 3, type: 'recurring', eventDate: null, eventTime: '18:00', dayOfWeek: new Date().getUTCDay(), startDate: start, endDate: end },
    ]
    const { listUpcomingItems } = await import('@/lib/events-queries')
    const items = await listUpcomingItems()
    expect(items.length).toBeGreaterThan(1)
    expect(items.every((i) => i.event.id === 3)).toBe(true)
  })
})
