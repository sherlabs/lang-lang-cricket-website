import { describe, it, expect, vi, beforeEach } from 'vitest'
import { events, eventRsvps } from '@/db/schema'
import { RSVP_COOKIE, RSVP_COOKIE_MAX_ENTRIES } from '@/lib/rsvp-cookie'

let inserted: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null
let eventRow: Record<string, unknown> | null = null
let rsvpRow: Record<string, unknown> | null = null
let cookieValue: string | undefined
let setCookie: { name: string; value: string; options: Record<string, unknown> } | null = null

// Pin "now" so the fixture dates below (Oct/Nov 2026 "future", Jan 2026 "past")
// stay correct forever, regardless of when this suite actually runs.
vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return { ...actual, nowAsEventClock: () => new Date('2026-06-01T12:00:00.000Z') }
})

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name === RSVP_COOKIE && cookieValue !== undefined ? { value: cookieValue } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      setCookie = { name, value, options }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === events) return Promise.resolve(eventRow ? [eventRow] : [])
          if (table === eventRsvps) return Promise.resolve(rsvpRow ? [rsvpRow] : [])
          return Promise.resolve([])
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated = v
          return Promise.resolve()
        },
      }),
    }),
  },
}))

beforeEach(() => {
  inserted = null
  updated = null
  rsvpRow = null
  cookieValue = undefined
  setCookie = null
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const ONE_TIME = { id: 1, type: 'one_time', eventDate: new Date('2026-11-15T00:00:00Z'), eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null, mealOptions: [] }
const RECURRING = {
  id: 2,
  type: 'recurring',
  eventDate: null,
  eventTime: '18:00',
  dayOfWeek: 4,
  startDate: new Date('2026-10-01T00:00:00Z'),
  endDate: new Date('2026-10-31T00:00:00Z'),
  mealOptions: [],
}
const DINNER = { ...ONE_TIME, id: 3, mealOptions: ['Beef', 'Chicken'] }
const ONE_TIME_ISO = '2026-11-15T18:00:00.000Z'
const ONE_TIME_KEY = `1:${ONE_TIME_ISO}`

describe('submitRsvp', () => {
  it('inserts a "yes" RSVP for a valid one-time event date and remembers it in the cookie', async () => {
    eventRow = ONE_TIME
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat Smith', email: 'pat@x.com' }))
    expect(result).toEqual({ ok: true, response: 'yes' })
    expect(inserted).toMatchObject({ eventId: 1, name: 'Pat Smith', response: 'yes', meal: '' })
    expect(typeof inserted!.editToken).toBe('string')
    expect(setCookie!.name).toBe(RSVP_COOKIE)
    expect(setCookie!.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
    expect(JSON.parse(setCookie!.value)).toEqual({ name: 'Pat Smith', email: 'pat@x.com', rsvps: { [ONE_TIME_KEY]: inserted!.editToken } })
  })

  it('inserts a "no" RSVP (name still required, meal cleared)', async () => {
    eventRow = DINNER
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'no', name: 'Pat', dinner: 'yes', meal: 'Beef' }))
    expect(result).toEqual({ ok: true, response: 'no' })
    expect(inserted).toMatchObject({ response: 'no', meal: '' })
  })

  it('rejects an invalid response', async () => {
    eventRow = ONE_TIME
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'maybe', name: 'Pat' }))
    expect(result).toEqual({ error: 'Please choose yes or no.' })
    expect(inserted).toBeNull()
  })

  it('rejects a one-time RSVP for the wrong date', async () => {
    eventRow = ONE_TIME
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-11-16T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('accepts a valid recurring occurrence date', async () => {
    eventRow = RECURRING
    const { submitRsvp } = await import('@/app/events/actions')
    await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-10-08T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(inserted).toMatchObject({ eventId: 2, name: 'Pat Smith' })
  })

  it('rejects a recurring occurrence date on the wrong weekday', async () => {
    eventRow = RECURRING
    const { submitRsvp } = await import('@/app/events/actions')
    // 2026-10-09 is a Friday, not a Thursday.
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-10-09T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('rejects a recurring occurrence date past the series end date', async () => {
    eventRow = RECURRING
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('rejects a missing name for both answers without inserting anything', async () => {
    eventRow = ONE_TIME
    const { submitRsvp } = await import('@/app/events/actions')
    expect(await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: '  ' }))).toEqual({ error: 'Name is required.' })
    expect(await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'no', name: '' }))).toEqual({ error: 'Name is required.' })
    expect(inserted).toBeNull()
  })

  it('rejects an RSVP for an event that does not exist', async () => {
    eventRow = null
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '999', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(inserted).toBeNull()
  })

  it('rejects an already-past occurrence of an otherwise-valid one-time event', async () => {
    eventRow = { ...ONE_TIME, eventDate: new Date('2026-01-15T00:00:00Z') }
    const { submitRsvp } = await import('@/app/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-01-15T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  it('rejects an already-past occurrence of an otherwise-valid recurring event', async () => {
    eventRow = { ...RECURRING, startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2026-12-31T00:00:00Z') }
    const { submitRsvp } = await import('@/app/events/actions')
    // 2026-01-15 is a Thursday, matches dayOfWeek 4, but is well in the past.
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-01-15T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted).toBeNull()
  })

  describe('dinner', () => {
    it('requires the dinner answer when the event has meal options', async () => {
      eventRow = DINNER
      const { submitRsvp } = await import('@/app/events/actions')
      const result = await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(result).toEqual({ error: 'Please tell us whether you want dinner.' })
      expect(inserted).toBeNull()
    })

    it('dinner yes requires one of the options', async () => {
      eventRow = DINNER
      const { submitRsvp } = await import('@/app/events/actions')
      expect(await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'yes' }))).toEqual({
        error: 'Please choose a dinner option.',
      })
      expect(await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'yes', meal: 'Fish' }))).toEqual({
        error: 'That dinner option is not available.',
      })
      expect(inserted).toBeNull()
      await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'yes', meal: 'Chicken' }))
      expect(inserted).toMatchObject({ response: 'yes', meal: 'Chicken' })
    })

    it('dinner no stores an empty meal even if a type was sent', async () => {
      eventRow = DINNER
      const { submitRsvp } = await import('@/app/events/actions')
      await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'no', meal: 'Beef' }))
      expect(inserted).toMatchObject({ response: 'yes', meal: '' })
    })

    it('ignores meal fields when the event has no options', async () => {
      eventRow = ONE_TIME
      const { submitRsvp } = await import('@/app/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', meal: 'Beef' }))
      expect(inserted).toMatchObject({ meal: '' })
    })
  })

  describe('device memory', () => {
    it('updates the existing row (no duplicate) when the cookie holds a live token for the occurrence', async () => {
      eventRow = ONE_TIME
      rsvpRow = { id: 10, eventId: 1, editToken: 'tok-1', response: 'yes' }
      cookieValue = JSON.stringify({ name: 'Old', email: '', rsvps: { [ONE_TIME_KEY]: 'tok-1' } })
      const { submitRsvp } = await import('@/app/events/actions')
      const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'no', name: 'Pat Smith' }))
      expect(result).toEqual({ ok: true, response: 'no' })
      expect(inserted).toBeNull()
      expect(updated).toMatchObject({ name: 'Pat Smith', response: 'no' })
      expect(JSON.parse(setCookie!.value).rsvps).toEqual({ [ONE_TIME_KEY]: 'tok-1' })
    })

    it('inserts a fresh row when the remembered token no longer exists (admin deleted it)', async () => {
      eventRow = ONE_TIME
      rsvpRow = null
      cookieValue = JSON.stringify({ name: 'Old', email: '', rsvps: { [ONE_TIME_KEY]: 'gone' } })
      const { submitRsvp } = await import('@/app/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat Smith' }))
      expect(updated).toBeNull()
      expect(inserted).not.toBeNull()
      expect(JSON.parse(setCookie!.value).rsvps[ONE_TIME_KEY]).toBe(inserted!.editToken)
    })

    it('does not touch a row that belongs to a different event even if the cookie points at it', async () => {
      eventRow = ONE_TIME
      rsvpRow = { id: 10, eventId: 99, editToken: 'tok-other' }
      cookieValue = JSON.stringify({ name: '', email: '', rsvps: { [ONE_TIME_KEY]: 'tok-other' } })
      const { submitRsvp } = await import('@/app/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(updated).toBeNull()
      expect(inserted).not.toBeNull()
    })

    it('treats a malformed cookie as empty', async () => {
      eventRow = ONE_TIME
      cookieValue = '{oops'
      const { submitRsvp } = await import('@/app/events/actions')
      const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(result).toEqual({ ok: true, response: 'yes' })
      expect(inserted).not.toBeNull()
    })

    it('caps the cookie at the newest entries, dropping the oldest', async () => {
      eventRow = ONE_TIME
      const rsvps: Record<string, string> = {}
      for (let i = 0; i < RSVP_COOKIE_MAX_ENTRIES; i++) rsvps[`${100 + i}:2026-10-01T00:00:00.000Z`] = `t${i}`
      cookieValue = JSON.stringify({ name: '', email: '', rsvps })
      const { submitRsvp } = await import('@/app/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      const stored = JSON.parse(setCookie!.value).rsvps as Record<string, string>
      const keys = Object.keys(stored)
      expect(keys).toHaveLength(RSVP_COOKIE_MAX_ENTRIES)
      expect(stored['100:2026-10-01T00:00:00.000Z']).toBeUndefined()
      expect(keys[keys.length - 1]).toBe(ONE_TIME_KEY)
    })
  })
})
