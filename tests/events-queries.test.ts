import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let eventRows: unknown[] = []
let photoRows: unknown[] = []
let fixedNow: Date | null = null

vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return {
    ...actual,
    nowAsEventClock: (now?: Date) => (fixedNow ? new Date(fixedNow) : actual.nowAsEventClock(now)),
  }
})

let fake: PayloadFake
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

/** Fixture rows are written domain-style (Dates); store them Payload-style (ISO strings). */
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
function load() {
  fake = createPayloadFake({
    events: (eventRows as Record<string, unknown>[]).map((e) => ({
      title: 'E',
      mealOptions: [],
      ...e,
      eventDate: iso(e.eventDate),
      startDate: iso(e.startDate),
      endDate: iso(e.endDate),
      dayOfWeek: e.dayOfWeek == null ? null : String(e.dayOfWeek),
    })) as never,
    'event-photos': photoRows as never,
    'event-rsvps': rsvpRows as never,
  })
}
let rsvpRows: unknown[] = []

beforeEach(() => {
  fixedNow = null
  photoRows = []
  rsvpRows = []
})

describe('listUpcomingItems', () => {
  it('includes a future one-time event as a single item', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    eventRows = [
      { id: 1, type: 'one_time', eventDate: future, eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
    ]
    load()
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
    load()
    const { listUpcomingItems } = await import('@/lib/events-queries')
    expect(await listUpcomingItems()).toEqual([])
  })

  it('includes only the single next occurrence of an active recurring event, even though many more exist in the window', async () => {
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000) // started yesterday
    const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // ends in 90 days
    eventRows = [
      { id: 3, type: 'recurring', eventDate: null, eventTime: '18:00', dayOfWeek: new Date().getUTCDay(), startDate: start, endDate: end },
    ]
    load()
    const { listUpcomingItems } = await import('@/lib/events-queries')
    const items = await listUpcomingItems()
    expect(items).toHaveLength(1)
    expect(items[0].event.id).toBe(3)
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
      load()
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
      load()
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
      load()
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
      load()
    const { listUpcomingItems } = await import('@/lib/events-queries')
      expect(await listUpcomingItems()).toEqual([])
    })

    it('is still upcoming the instant before 18:00 Melbourne (AEDT, UTC+11) on the event day', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-05T06:59:00.000Z')) // 17:59 AEDT
      eventRows = [
        { id: 21, type: 'one_time', eventDate: new Date('2026-11-05T00:00:00.000Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null },
      ]
      load()
    const { listUpcomingItems } = await import('@/lib/events-queries')
      const items = await listUpcomingItems()
      expect(items).toHaveLength(1)
      expect(items[0].event.id).toBe(21)
    })
  })
})

describe('getEventPhotosPublic', () => {
  it('returns only approved photos, excluding pending submissions', async () => {
    photoRows = [
      { id: 1, event: 5, url: 'https://x.public.blob.vercel-storage.com/approved.jpg', status: 'approved', sortOrder: 0 },
      { id: 2, event: 5, url: 'https://x.public.blob.vercel-storage.com/pending.jpg', status: 'pending', sortOrder: 1 },
      { id: 3, event: 6, url: 'https://x.public.blob.vercel-storage.com/other.jpg', status: 'approved', sortOrder: 0 },
      { id: 4, event: 5, url: 'https://x.public.blob.vercel-storage.com/first.jpg', status: 'approved', sortOrder: -1 },
    ]
    eventRows = []
    load()
    const { getEventPhotosPublic } = await import('@/lib/events-queries')
    const photos = await getEventPhotosPublic(5)
    expect(photos).toEqual([{ url: 'https://x.public.blob.vercel-storage.com/first.jpg' }, { url: 'https://x.public.blob.vercel-storage.com/approved.jpg' }])
    expect(fake.callsTo('find', 'event-photos')[0].args).toMatchObject({
      where: { and: [{ event: { equals: 5 } }, { status: { equals: 'approved' } }] },
      sort: ['sortOrder', 'id'],
    })
  })
})

describe('public query shape (spec §2, §14)', () => {
  it('every events read passes joins:false (the joins would load RSVP tokens/emails and pending photos)', async () => {
    eventRows = [{ id: 1, type: 'one_time', eventDate: new Date('2026-11-05T00:00:00.000Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }]
    load()
    const q = await import('@/lib/events-queries')
    await q.listUpcomingItems()
    await q.listPastOneTimeEvents()
    await q.getEventById(1)
    const finds = fake.callsTo('find', 'events')
    expect(finds).toHaveLength(3)
    for (const f of finds) expect(f.args).toMatchObject({ joins: false })
    expect(finds[1].args.where).toEqual({ type: { equals: 'one_time' } })
    expect(finds[2].args.where).toEqual({ id: { equals: 1 } })
  })

  it('getEventById maps the doc to the domain shape and returns null for a bad or missing id', async () => {
    eventRows = [{ id: 1, type: 'recurring', eventDate: null, eventTime: '17:30', dayOfWeek: 2, startDate: new Date('2026-09-01T00:00:00.000Z'), endDate: new Date('2026-12-15T00:00:00.000Z'), mealOptions: [{ label: 'Parma' }, { label: 'Parma' }], cover: { id: 9, url: 'https://x/c.jpg' } }]
    load()
    const { getEventById } = await import('@/lib/events-queries')
    const e = await getEventById(1)
    expect(e).toMatchObject({ id: 1, type: 'recurring', dayOfWeek: 2, mealOptions: ['Parma', 'Parma'], coverImageUrl: 'https://x/c.jpg', eventDate: null })
    expect(e!.startDate!.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(await getEventById(2)).toBeNull()
    expect(await getEventById(Number.NaN)).toBeNull()
  })

  it('getRsvpTally counts each answer for exactly one occurrence (ms precision)', async () => {
    rsvpRows = [
      { id: 1, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes' },
      { id: 2, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'no' },
      { id: 3, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes' },
      { id: 4, event: 5, occurrenceDate: '2026-11-12T18:00:00.000Z', response: 'yes' },
      { id: 5, event: 6, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes' },
    ]
    eventRows = []
    load()
    const { getRsvpTally } = await import('@/lib/events-queries')
    expect(await getRsvpTally(5, new Date('2026-11-05T18:00:00.000Z'))).toEqual({ yes: 2, no: 1 })
    expect(fake.callsTo('count', 'event-rsvps')).toHaveLength(2)
  })

  it('listGoingCounts groups future "yes" answers by event + occurrence', async () => {
    fixedNow = new Date('2026-11-01T00:00:00.000Z')
    rsvpRows = [
      { id: 1, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes' },
      { id: 2, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes' },
      { id: 3, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'no' },
      { id: 4, event: 5, occurrenceDate: '2026-10-01T18:00:00.000Z', response: 'yes' },
    ]
    eventRows = []
    load()
    const { listGoingCounts } = await import('@/lib/events-queries')
    const counts = await listGoingCounts()
    expect([...counts.entries()]).toEqual([['5:2026-11-05T18:00:00.000Z', 2]])
    expect(fake.callsTo('find', 'event-rsvps')[0].args).toMatchObject({ select: { event: true, occurrenceDate: true }, pagination: false })
  })

  it('getRsvpByToken refuses a non-UUID-shaped token without querying', async () => {
    rsvpRows = [{ id: 1, event: 5, occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes', name: 'P', editToken: '' }]
    eventRows = []
    load()
    const { getRsvpByToken } = await import('@/lib/events-queries')
    expect(await getRsvpByToken('')).toBeNull()
    expect(await getRsvpByToken('short')).toBeNull()
    expect(fake.callsTo('find', 'event-rsvps')).toHaveLength(0)
  })
})
