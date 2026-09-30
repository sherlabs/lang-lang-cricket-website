import { describe, it, expect, vi, beforeEach } from 'vitest'
import { events, eventRsvps } from '@/db/schema'
import { RSVP_COOKIE } from '@/lib/rsvp-cookie'

let row: Record<string, unknown> | null = null
let eventRow: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null
let deleted = false
let cookieValue: string | undefined
let setCookie: { name: string; value: string } | null = null

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (name === RSVP_COOKIE && cookieValue !== undefined ? { value: cookieValue } : undefined),
    set: (name: string, value: string) => {
      setCookie = { name, value }
    },
  }),
}))
vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => {
          if (table === eventRsvps) return Promise.resolve(row ? [row] : [])
          if (table === events) return Promise.resolve(eventRow ? [eventRow] : [])
          return Promise.resolve([])
        },
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated = v
          return Promise.resolve()
        },
      }),
    }),
    delete: () => ({
      where: () => {
        deleted = true
        return Promise.resolve()
      },
    }),
  },
}))

beforeEach(() => {
  updated = null
  deleted = false
  eventRow = { id: 5, mealOptions: [] }
  cookieValue = undefined
  setCookie = null
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateRsvpByToken', () => {
  it('updates name/email/note for a matching token', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Old Name', response: 'yes', meal: '' }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken('tok', formData({ name: 'New Name', email: '', note: 'bringing salad' }))
    expect(result).toBeUndefined()
    expect(updated).toMatchObject({ name: 'New Name', note: 'bringing salad', response: 'yes' })
  })

  it('switches the yes/no answer and clears the meal on "no"', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Old Name', response: 'yes', meal: 'Beef' }
    eventRow = { id: 5, mealOptions: ['Beef'] }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    await updateRsvpByToken('tok', formData({ name: 'Old Name', response: 'no', dinner: 'yes', meal: 'Beef' }))
    expect(updated).toMatchObject({ response: 'no', meal: '' })
  })

  it('keeps the stored answer when the response field is missing or invalid', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Old Name', response: 'no', meal: '' }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    await updateRsvpByToken('tok', formData({ name: 'Old Name', response: 'maybe' }))
    expect(updated).toMatchObject({ response: 'no' })
  })

  it('applies the dinner rule against the event options', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Pat', response: 'yes', meal: '' }
    eventRow = { id: 5, mealOptions: ['Beef', 'Chicken'] }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    expect(await updateRsvpByToken('tok', formData({ name: 'Pat', response: 'yes' }))).toEqual({ error: 'Please tell us whether you want dinner.' })
    expect(await updateRsvpByToken('tok', formData({ name: 'Pat', response: 'yes', dinner: 'yes', meal: 'Fish' }))).toEqual({
      error: 'That dinner option is not available.',
    })
    expect(updated).toBeNull()
    await updateRsvpByToken('tok', formData({ name: 'Pat', response: 'yes', dinner: 'no', meal: 'Beef' }))
    expect(updated).toMatchObject({ meal: '' })
    await updateRsvpByToken('tok', formData({ name: 'Pat', response: 'yes', dinner: 'yes', meal: 'Chicken' }))
    expect(updated).toMatchObject({ meal: 'Chicken' })
  })

  it('keeps the stored meal when the event has been deleted', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Pat', response: 'yes', meal: 'Beef' }
    eventRow = null
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    await updateRsvpByToken('tok', formData({ name: 'Pat', response: 'yes' }))
    expect(updated).toMatchObject({ meal: 'Beef' })
  })

  it('returns an error for an unknown token without throwing', async () => {
    row = null
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken('missing', formData({ name: 'New Name' }))
    expect(result).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(updated).toBeNull()
  })

  it('rejects an empty name', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Old Name', response: 'yes', meal: '' }
    const { updateRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken('tok', formData({ name: '' }))
    expect(result).toEqual({ error: 'Name is required.' })
    expect(updated).toBeNull()
  })
})

describe('cancelRsvpByToken', () => {
  it('deletes the matching row and forgets it in the device cookie', async () => {
    row = { id: 1, eventId: 5, editToken: 'tok', name: 'Old Name' }
    cookieValue = JSON.stringify({ name: 'Pat', email: '', rsvps: { '5:2026-10-01T18:00:00.000Z': 'tok', '6:x': 'other' } })
    const { cancelRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await cancelRsvpByToken('tok')
    expect(result).toBeUndefined()
    expect(deleted).toBe(true)
    expect(setCookie!.name).toBe(RSVP_COOKIE)
    expect(JSON.parse(setCookie!.value)).toEqual({ name: 'Pat', email: '', rsvps: { '6:x': 'other' } })
  })

  it('returns an error for an unknown token', async () => {
    row = null
    const { cancelRsvpByToken } = await import('@/app/events/rsvp/[token]/actions')
    const result = await cancelRsvpByToken('missing')
    expect(result).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(deleted).toBe(false)
  })
})
