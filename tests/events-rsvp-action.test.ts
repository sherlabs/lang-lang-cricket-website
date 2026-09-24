import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let eventRow: Record<string, unknown> | null = null

// Pin "now" so the fixture dates below (Oct/Nov 2026 "future", Jan 2026 "past")
// stay correct forever, regardless of when this suite actually runs.
vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return { ...actual, nowAsEventClock: () => new Date('2026-06-01T12:00:00.000Z') }
})

vi.mock('next/headers', () => ({ cookies: () => ({ set: vi.fn() }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(eventRow ? [eventRow] : []) }) }),
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
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('submitRsvp', () => {
  it('inserts an RSVP for a valid one-time event date', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-11-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitRsvp } = await import('@/app/events/actions')
    await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-11-15T18:00:00.000Z', name: 'Pat Smith' }))
    expect(inserted).toMatchObject({ eventId: 1, name: 'Pat Smith' })
    expect(typeof inserted!.editToken).toBe('string')
  })

  it('rejects a one-time RSVP for the wrong date', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-11-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-11-16T18:00:00.000Z', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('accepts a valid recurring occurrence date', async () => {
    eventRow = {
      id: 2,
      type: 'recurring',
      eventDate: null,
      eventTime: '18:00',
      dayOfWeek: 4,
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2026-10-31T00:00:00Z'),
    }
    const { submitRsvp } = await import('@/app/events/actions')
    await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-10-08T18:00:00.000Z', name: 'Pat Smith' }))
    expect(inserted).toMatchObject({ eventId: 2, name: 'Pat Smith' })
  })

  it('rejects a recurring occurrence date on the wrong weekday', async () => {
    eventRow = {
      id: 2,
      type: 'recurring',
      eventDate: null,
      eventTime: '18:00',
      dayOfWeek: 4,
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2026-10-31T00:00:00Z'),
    }
    const { submitRsvp } = await import('@/app/events/actions')
    // 2026-10-09 is a Friday, not a Thursday.
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-10-09T18:00:00.000Z', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('rejects a recurring occurrence date past the series end date', async () => {
    eventRow = {
      id: 2,
      type: 'recurring',
      eventDate: null,
      eventTime: '18:00',
      dayOfWeek: 4,
      startDate: new Date('2026-10-01T00:00:00Z'),
      endDate: new Date('2026-10-31T00:00:00Z'),
    }
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-11-05T18:00:00.000Z', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('rejects a missing name without inserting anything', async () => {
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-11-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-11-15T18:00:00.000Z', name: '' }))
    expect(result).toEqual({ error: 'Name is required.' })
    expect(inserted).toBeNull()
  })

  it('rejects an RSVP for an event that does not exist', async () => {
    eventRow = null
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '999', occurrenceDate: '2026-11-15T18:00:00.000Z', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(inserted).toBeNull()
  })

  it('rejects an RSVP for an already-past occurrence of an otherwise-valid one-time event', async () => {
    // A real occurrence of the series (matches eventDate/eventTime exactly), but in the past
    // relative to "today" — the public page would never offer this date, but a crafted request could.
    eventRow = { id: 1, type: 'one_time', eventDate: new Date('2026-01-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null }
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-01-15T18:00:00.000Z', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('rejects an RSVP for an already-past occurrence of an otherwise-valid recurring event', async () => {
    eventRow = {
      id: 2,
      type: 'recurring',
      eventDate: null,
      eventTime: '18:00',
      dayOfWeek: 4,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-12-31T00:00:00Z'),
    }
    const { submitRsvp } = await import('@/app/events/actions')
    // 2026-01-15 is a Thursday, matches dayOfWeek 4, but is well in the past.
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-01-15T18:00:00.000Z', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })
})
