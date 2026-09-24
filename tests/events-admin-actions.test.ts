import { describe, it, expect, vi, beforeEach } from 'vitest'
import { eventRsvps, eventPhotos } from '@/db/schema'

let inserted: Record<string, unknown> | null = null
let eventRows: unknown[] = []
let rsvpCounts: { eventId: number; count: number }[] = []
let pendingPhotoCounts: { eventId: number; count: number }[] = []

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'token' }) }) }))
vi.mock('@/lib/auth', () => ({ COOKIE_NAME: 'llcc_admin_session', verifySessionCookie: async () => true }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        if (table === eventRsvps) return { groupBy: () => Promise.resolve(rsvpCounts) }
        if (table === eventPhotos) return { where: () => ({ groupBy: () => Promise.resolve(pendingPhotoCounts) }) }
        return { orderBy: () => Promise.resolve(eventRows) }
      },
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
  },
}))

beforeEach(() => {
  inserted = null
  eventRows = []
  rsvpCounts = []
  pendingPhotoCounts = []
})

const ONE_TIME_INPUT = {
  type: 'one_time' as const,
  title: 'Presentation Night',
  description: '',
  location: 'Clubrooms',
  coverImageUrl: '',
  paymentLinkLabel: '',
  paymentLinkUrl: '',
  eventTime: '19:00',
  eventDateStr: '2026-11-15',
  dayOfWeek: null,
  startDateStr: '',
  endDateStr: '',
}

const RECURRING_INPUT = {
  type: 'recurring' as const,
  title: 'Thursday Training',
  description: '',
  location: 'Nets',
  coverImageUrl: '',
  paymentLinkLabel: '',
  paymentLinkUrl: '',
  eventTime: '18:00',
  eventDateStr: '',
  dayOfWeek: 4,
  startDateStr: '2026-10-01',
  endDateStr: '2027-03-31',
}

describe('createEvent', () => {
  it('stores a one-time event with eventDate set and recurring fields null', async () => {
    const { createEvent } = await import('@/app/admin/(shell)/events/actions')
    await createEvent(ONE_TIME_INPUT)
    expect(inserted).toMatchObject({ type: 'one_time', title: 'Presentation Night', eventTime: '19:00' })
    expect((inserted!.eventDate as Date).toISOString()).toBe('2026-11-15T00:00:00.000Z')
    expect(inserted!.dayOfWeek).toBeNull()
    expect(inserted!.startDate).toBeNull()
    expect(inserted!.endDate).toBeNull()
  })

  it('stores a recurring event with dayOfWeek/startDate/endDate set and eventDate null', async () => {
    const { createEvent } = await import('@/app/admin/(shell)/events/actions')
    await createEvent(RECURRING_INPUT)
    expect(inserted).toMatchObject({ type: 'recurring', title: 'Thursday Training', dayOfWeek: 4 })
    expect(inserted!.eventDate).toBeNull()
    expect((inserted!.startDate as Date).toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect((inserted!.endDate as Date).toISOString()).toBe('2027-03-31T00:00:00.000Z')
  })

  it('rejects a missing title', async () => {
    const { createEvent } = await import('@/app/admin/(shell)/events/actions')
    await expect(createEvent({ ...ONE_TIME_INPUT, title: '' })).rejects.toThrow('Title is required.')
    expect(inserted).toBeNull()
  })

  it('rejects a one-time event with no date', async () => {
    const { createEvent } = await import('@/app/admin/(shell)/events/actions')
    await expect(createEvent({ ...ONE_TIME_INPUT, eventDateStr: '' })).rejects.toThrow('Date is required.')
    expect(inserted).toBeNull()
  })

  it('rejects a recurring event missing a start or end date', async () => {
    const { createEvent } = await import('@/app/admin/(shell)/events/actions')
    await expect(createEvent({ ...RECURRING_INPUT, endDateStr: '' })).rejects.toThrow('Start and end dates are required.')
    expect(inserted).toBeNull()
  })
})

describe('listEvents', () => {
  it('attaches an aggregated rsvpCount and pendingPhotoCount per event, defaulting to 0 when none', async () => {
    eventRows = [
      { id: 1, title: 'Presentation Night' },
      { id: 2, title: 'Thursday Training' },
    ]
    rsvpCounts = [{ eventId: 1, count: 3 }]
    pendingPhotoCounts = [{ eventId: 2, count: 2 }]
    const { listEvents } = await import('@/app/admin/(shell)/events/actions')
    const result = await listEvents()
    expect(result).toEqual([
      { id: 1, title: 'Presentation Night', rsvpCount: 3, pendingPhotoCount: 0 },
      { id: 2, title: 'Thursday Training', rsvpCount: 0, pendingPhotoCount: 2 },
    ])
  })
})
