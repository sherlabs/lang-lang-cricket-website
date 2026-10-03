import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RSVP_COOKIE, RSVP_COOKIE_MAX_ENTRIES } from '@/lib/rsvp-cookie'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let fake: PayloadFake
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
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

/** Payload-shaped event docs (dates as ISO strings, mealOptions as rows, dayOfWeek as a string). */
const ONE_TIME = { id: 1, type: 'one_time', eventDate: '2026-11-15T00:00:00.000Z', eventTime: '18:00', dayOfWeek: null, startDate: null, endDate: null, mealOptions: [] }
const RECURRING = {
  id: 2,
  type: 'recurring',
  eventDate: null,
  eventTime: '18:00',
  dayOfWeek: '4',
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2026-10-31T00:00:00.000Z',
  mealOptions: [],
}
const DINNER = { ...ONE_TIME, id: 3, mealOptions: [{ label: 'Beef' }, { label: 'Chicken' }] }
const ONE_TIME_ISO = '2026-11-15T18:00:00.000Z'
const ONE_TIME_KEY = `1:${ONE_TIME_ISO}`
const TOK_1 = '11111111-1111-4111-8111-111111111111'
const TOK_OTHER = '22222222-2222-4222-8222-222222222222'

let events: Record<string, unknown>[] = []
let rsvps: Record<string, unknown>[] = []

function setup() {
  fake = createPayloadFake({ events: events as never, 'event-rsvps': rsvps as never })
}

/** The last RSVP create / update, or null. */
const inserted = () => (fake.callsTo('create', 'event-rsvps').at(-1)?.args.data as Record<string, unknown> | undefined) ?? null
const updated = () => (fake.callsTo('update', 'event-rsvps').at(-1)?.args as { id: number; data: Record<string, unknown> } | undefined) ?? null

beforeEach(() => {
  events = [ONE_TIME, RECURRING, DINNER]
  rsvps = []
  cookieValue = undefined
  setCookie = null
  setup()
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('submitRsvp', () => {
  it('inserts a "yes" RSVP for a valid one-time event date and remembers it in the cookie', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat Smith', email: 'pat@x.com' }))
    expect(result).toEqual({ ok: true, response: 'yes' })
    expect(inserted()).toMatchObject({ event: 1, occurrenceDate: ONE_TIME_ISO, name: 'Pat Smith', response: 'yes', meal: '' })
    expect(typeof inserted()!.editToken).toBe('string')
    expect(setCookie!.name).toBe(RSVP_COOKIE)
    expect(setCookie!.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 })
    expect(JSON.parse(setCookie!.value)).toEqual({ name: 'Pat Smith', email: 'pat@x.com', rsvps: { [ONE_TIME_KEY]: inserted()!.editToken } })
  })

  it('inserts a "no" RSVP (name still required, meal cleared)', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'no', name: 'Pat', dinner: 'yes', meal: 'Beef' }))
    expect(result).toEqual({ ok: true, response: 'no' })
    expect(inserted()).toMatchObject({ response: 'no', meal: '' })
  })

  it('rejects an invalid response', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'maybe', name: 'Pat' }))
    expect(result).toEqual({ error: 'Please choose yes or no.' })
    expect(inserted()).toBeNull()
  })

  it('rejects a one-time RSVP for the wrong date', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-11-16T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted()).toBeNull()
  })

  it('accepts a valid recurring occurrence date', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-10-08T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(inserted()).toMatchObject({ event: 2, occurrenceDate: '2026-10-08T18:00:00.000Z', name: 'Pat Smith' })
  })

  it('rejects a recurring occurrence date on the wrong weekday', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    // 2026-10-09 is a Friday, not a Thursday.
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-10-09T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted()).toBeNull()
  })

  it('rejects a recurring occurrence date past the series end date', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-11-05T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted()).toBeNull()
  })

  it('rejects a missing name for both answers without inserting anything', async () => {
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    expect(await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: '  ' }))).toEqual({ error: 'Name is required.' })
    expect(await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'no', name: '' }))).toEqual({ error: 'Name is required.' })
    expect(inserted()).toBeNull()
  })

  it('rejects an RSVP for an event that does not exist', async () => {
    events = []
    setup()
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '999', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'Event not found.' })
    expect(inserted()).toBeNull()
  })

  it('rejects an already-past occurrence of an otherwise-valid one-time event', async () => {
    events = [{ ...ONE_TIME, eventDate: '2026-01-15T00:00:00.000Z' }]
    setup()
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: '2026-01-15T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted()).toBeNull()
  })

  it('rejects an already-past occurrence of an otherwise-valid recurring event', async () => {
    events = [{ ...RECURRING, startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-12-31T00:00:00.000Z' }]
    setup()
    const { submitRsvp } = await import('@/app/(frontend)/events/actions')
    // 2026-01-15 is a Thursday, matches dayOfWeek 4, but is well in the past.
    const result = await submitRsvp(formData({ eventId: '2', occurrenceDate: '2026-01-15T18:00:00.000Z', response: 'yes', name: 'Pat Smith' }))
    expect(result).toEqual({ error: 'That date is not available for this event.' })
    expect(inserted()).toBeNull()
  })

  describe('dinner', () => {
    it('requires the dinner answer when the event has meal options', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      const result = await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(result).toEqual({ error: 'Please tell us whether you want dinner.' })
      expect(inserted()).toBeNull()
    })

    it('dinner yes requires one of the options', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      expect(await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'yes' }))).toEqual({
        error: 'Please choose a dinner option.',
      })
      expect(await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'yes', meal: 'Fish' }))).toEqual({
        error: 'That dinner option is not available.',
      })
      expect(inserted()).toBeNull()
      await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'yes', meal: 'Chicken' }))
      expect(inserted()).toMatchObject({ response: 'yes', meal: 'Chicken' })
    })

    it('dinner no stores an empty meal even if a type was sent', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '3', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', dinner: 'no', meal: 'Beef' }))
      expect(inserted()).toMatchObject({ response: 'yes', meal: '' })
    })

    it('ignores meal fields when the event has no options', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', meal: 'Beef' }))
      expect(inserted()).toMatchObject({ meal: '' })
    })
  })

  describe('device memory', () => {
    it('updates the existing row (no duplicate) when the cookie holds a live token for the occurrence', async () => {
      rsvps = [{ id: 10, event: 1, occurrenceDate: ONE_TIME_ISO, name: 'Old', editToken: TOK_1, response: 'yes' }]
      setup()
      cookieValue = JSON.stringify({ name: 'Old', email: '', rsvps: { [ONE_TIME_KEY]: TOK_1 } })
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'no', name: 'Pat Smith' }))
      expect(result).toEqual({ ok: true, response: 'no' })
      expect(inserted()).toBeNull()
      expect(updated()!.data).toMatchObject({ name: 'Pat Smith', response: 'no' })
      expect(updated()!.id).toBe(10)
      expect(JSON.parse(setCookie!.value).rsvps).toEqual({ [ONE_TIME_KEY]: TOK_1 })
    })

    it('inserts a fresh row when the remembered token no longer exists (admin deleted it)', async () => {
      cookieValue = JSON.stringify({ name: 'Old', email: '', rsvps: { [ONE_TIME_KEY]: '33333333-3333-4333-8333-333333333333' } })
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat Smith' }))
      expect(updated()).toBeNull()
      expect(inserted()).not.toBeNull()
      expect(JSON.parse(setCookie!.value).rsvps[ONE_TIME_KEY]).toBe(inserted()!.editToken)
    })

    it('does not touch a row that belongs to a different event even if the cookie points at it', async () => {
      rsvps = [{ id: 10, event: 99, occurrenceDate: ONE_TIME_ISO, name: 'X', editToken: TOK_OTHER, response: 'yes' }]
      setup()
      cookieValue = JSON.stringify({ name: '', email: '', rsvps: { [ONE_TIME_KEY]: TOK_OTHER } })
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(updated()).toBeNull()
      expect(inserted()).not.toBeNull()
    })

    it('treats a malformed cookie as empty', async () => {
      cookieValue = '{oops'
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      const result = await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(result).toEqual({ ok: true, response: 'yes' })
      expect(inserted()).not.toBeNull()
    })

    it('caps the cookie at the newest entries, dropping the oldest', async () => {
      const rsvps: Record<string, string> = {}
      for (let i = 0; i < RSVP_COOKIE_MAX_ENTRIES; i++) rsvps[`${100 + i}:2026-10-01T00:00:00.000Z`] = `t${i}`
      cookieValue = JSON.stringify({ name: '', email: '', rsvps })
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      const stored = JSON.parse(setCookie!.value).rsvps as Record<string, string>
      const keys = Object.keys(stored)
      expect(keys).toHaveLength(RSVP_COOKIE_MAX_ENTRIES)
      expect(stored['100:2026-10-01T00:00:00.000Z']).toBeUndefined()
      expect(keys[keys.length - 1]).toBe(ONE_TIME_KEY)
    })

    it('never looks up a short (non-UUID) remembered token: an empty/forged token cannot match a row', async () => {
      rsvps = [{ id: 10, event: 1, occurrenceDate: ONE_TIME_ISO, name: 'X', editToken: '', response: 'yes' }]
      setup()
      cookieValue = JSON.stringify({ name: '', email: '', rsvps: { [ONE_TIME_KEY]: 'x' } })
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(fake.callsTo('find', 'event-rsvps')).toHaveLength(0)
      expect(updated()).toBeNull()
      expect(inserted()).not.toBeNull()
    })
  })

  describe('Local API usage (spec §6)', () => {
    it('creates with an allowlisted data object, overrideAccess and a generated UUID token', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      const fd = formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', id: '999', editToken: 'mine', status: 'x' })
      await submitRsvp(fd)
      const call = fake.callsTo('create', 'event-rsvps')[0].args as { data: Record<string, unknown>; overrideAccess: boolean }
      expect(call.overrideAccess).toBe(true)
      expect(Object.keys(call.data).sort()).toEqual(['editToken', 'email', 'event', 'meal', 'name', 'note', 'occurrenceDate', 'response'])
      expect(call.data.editToken).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('reads the event with joins disabled', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat' }))
      expect(fake.callsTo('find', 'events')[0].args).toMatchObject({ joins: false, where: { id: { equals: 1 } } })
    })

    it('rejects over-long text instead of storing it', async () => {
      const { submitRsvp } = await import('@/app/(frontend)/events/actions')
      expect(await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'x'.repeat(101) }))).toEqual({
        error: 'Name must be 100 characters or fewer.',
      })
      expect(await submitRsvp(formData({ eventId: '1', occurrenceDate: ONE_TIME_ISO, response: 'yes', name: 'Pat', note: 'x'.repeat(1001) }))).toEqual({
        error: 'Note must be 1000 characters or fewer.',
      })
      expect(inserted()).toBeNull()
    })
  })
})
