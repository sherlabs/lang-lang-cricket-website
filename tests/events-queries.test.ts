import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let eventRows: unknown[] = []
let fixedNow: Date | null = null

vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return {
    ...actual,
    nowAsEventClock: (now?: Date) => (fixedNow ? new Date(fixedNow) : actual.nowAsEventClock(now)),
  }
})

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () =>
        Object.assign(Promise.resolve(eventRows), {
          where: () => Promise.resolve(eventRows),
          orderBy: () => Promise.resolve(eventRows),
        }),
    }),
  },
}))

beforeEach(() => {
  fixedNow = null
})

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

  describe('wall-clock "now" boundary (Melbourne time, not UTC)', () => {
    // Fix "now" at 2026-11-05T18:00:00Z, encoded wall-clock-as-UTC (i.e. the
    // instant the helper says it is 6:00pm in Melbourne) — a real UTC instant
    // would put "now" many hours earlier or later, which is exactly the bug
    // this fix addresses.
    const boundary = new Date('2026-11-05T18:00:00.000Z')

    it('treats a one-time event at exactly the boundary as still upcoming', async () => {
      fixedNow = boundary
      eventRows = [
        { id: 10, type: 'one_time', eventDate: new Date('2026-11-05T00:00:00.000Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
      ]
      const { listUpcomingItems } = await import('@/lib/events-queries')
      const items = await listUpcomingItems()
      expect(items).toHaveLength(1)
      expect(items[0].event.id).toBe(10)
    })

    it('treats a one-time event one minute after the boundary as past', async () => {
      fixedNow = new Date(boundary.getTime() + 60 * 1000) // now is one minute after the event started
      eventRows = [
        { id: 11, type: 'one_time', eventDate: new Date('2026-11-05T00:00:00.000Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
      ]
      const { listUpcomingItems } = await import('@/lib/events-queries')
      expect(await listUpcomingItems()).toEqual([])
    })

    it('drops a recurring occurrence that already started earlier today (wall-clock), even though UTC midnight has not passed', async () => {
      // 2026-11-05 is a Thursday (dayOfWeek 4). The series' own session today
      // is at 18:00 Melbourne, i.e. earlier than "now" (one minute after the boundary).
      fixedNow = new Date(boundary.getTime() + 60 * 1000)
      eventRows = [
        {
          id: 12,
          type: 'recurring',
          eventDate: null,
          eventTime: '18:00',
          dayOfWeek: 4,
          startDate: new Date('2026-10-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
      ]
      const { listUpcomingItems } = await import('@/lib/events-queries')
      const items = await listUpcomingItems()
      // The filter must actually remove today's already-started session, not just
      // happen to return nothing — assert the series still has future occurrences,
      // and that today's session specifically isn't among them.
      expect(items.length).toBeGreaterThan(0)
      expect(items[0].occurrenceDate.toISOString()).toBe('2026-11-12T18:00:00.000Z')
      expect(items.every((i) => i.occurrenceDate.getTime() !== new Date('2026-11-05T18:00:00.000Z').getTime())).toBe(true)
    })
  })

  describe('wall-clock "now" boundary using the real system clock (not a mocked helper)', () => {
    // These exercise nowAsEventClock's own real-clock behavior (fixedNow stays null,
    // so the mock above falls through to the actual implementation) rather than
    // asserting against a mocked "now" — the old `new Date()`-based code would get
    // these wrong (it would treat a real UTC instant of 07:01Z as still "18:00 or
    // earlier" and call the event upcoming), so this pins the fix to real-clock semantics.
    afterEach(() => {
      vi.useRealTimers()
    })

    it('is past the instant after 18:00 Melbourne (AEDT, UTC+11) on the event day', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-05T07:01:00.000Z')) // 18:01 AEDT
      eventRows = [
        { id: 20, type: 'one_time', eventDate: new Date('2026-11-05T00:00:00.000Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
      ]
      const { listUpcomingItems } = await import('@/lib/events-queries')
      expect(await listUpcomingItems()).toEqual([])
    })

    it('is still upcoming the instant before 18:00 Melbourne (AEDT, UTC+11) on the event day', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-05T06:59:00.000Z')) // 17:59 AEDT
      eventRows = [
        { id: 21, type: 'one_time', eventDate: new Date('2026-11-05T00:00:00.000Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
      ]
      const { listUpcomingItems } = await import('@/lib/events-queries')
      const items = await listUpcomingItems()
      expect(items).toHaveLength(1)
      expect(items[0].event.id).toBe(21)
    })
  })
})
