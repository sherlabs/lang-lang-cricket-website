import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RSVP_COOKIE } from '@/lib/rsvp-cookie'
import { createPayloadFake, type PayloadFake } from './helpers/payload-fake'

let fake: PayloadFake
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
vi.mock('@/lib/payload/client', () => ({ getPayloadClient: async () => fake }))

const TOK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const rsvp = (over: Record<string, unknown> = {}) => ({
  id: 1,
  event: 5,
  occurrenceDate: '2026-10-01T18:00:00.000Z',
  editToken: TOK,
  name: 'Old Name',
  email: '',
  note: '',
  response: 'yes',
  meal: '',
  ...over,
})
const event = (mealOptions: string[] = []) => ({ id: 5, type: 'one_time', title: 'E', eventDate: '2026-10-01T00:00:00.000Z', eventTime: '18:00', mealOptions: mealOptions.map((label) => ({ label })) })

function setup(rows: Record<string, unknown>[], events: Record<string, unknown>[] = [event()]) {
  fake = createPayloadFake({ 'event-rsvps': rows as never, events: events as never })
}

const updated = () => (fake.callsTo('update', 'event-rsvps').at(-1)?.args as { id: number; data: Record<string, unknown> } | undefined) ?? null

beforeEach(() => {
  cookieValue = undefined
  setCookie = null
  setup([rsvp()])
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('updateRsvpByToken', () => {
  it('updates name/email/note for a matching token — by id, after a limit-1 token lookup', async () => {
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken(TOK, formData({ name: 'New Name', email: '', note: 'bringing salad' }))
    expect(result).toBeUndefined()
    expect(updated()).toMatchObject({ id: 1, data: { name: 'New Name', note: 'bringing salad', response: 'yes' } })
    expect(fake.callsTo('find', 'event-rsvps')[0].args).toMatchObject({ where: { editToken: { equals: TOK } }, limit: 1, depth: 0 })
    expect(fake.callsTo('update', 'event-rsvps')[0].args).toMatchObject({ overrideAccess: true })
    expect(fake.callsTo('update', 'event-rsvps')[0].args).not.toHaveProperty('where')
  })

  it('writes only allowlisted keys, whatever the form carries', async () => {
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    await updateRsvpByToken(TOK, formData({ name: 'N', editToken: OTHER, event: '9', occurrenceDate: '2030-01-01T00:00:00.000Z', id: '7' }))
    expect(Object.keys(updated()!.data).sort()).toEqual(['email', 'meal', 'name', 'note', 'response'])
  })

  it('switches the yes/no answer and clears the meal on "no"', async () => {
    setup([rsvp({ meal: 'Beef' })], [event(['Beef'])])
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    await updateRsvpByToken(TOK, formData({ name: 'Old Name', response: 'no', dinner: 'yes', meal: 'Beef' }))
    expect(updated()!.data).toMatchObject({ response: 'no', meal: '' })
  })

  it('keeps the stored answer when the response field is missing or invalid', async () => {
    setup([rsvp({ response: 'no' })])
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    await updateRsvpByToken(TOK, formData({ name: 'Old Name', response: 'maybe' }))
    expect(updated()!.data).toMatchObject({ response: 'no' })
  })

  it('applies the dinner rule against the event options', async () => {
    setup([rsvp({ name: 'Pat' })], [event(['Beef', 'Chicken'])])
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    expect(await updateRsvpByToken(TOK, formData({ name: 'Pat', response: 'yes' }))).toEqual({ error: 'Please tell us whether you want dinner.' })
    expect(await updateRsvpByToken(TOK, formData({ name: 'Pat', response: 'yes', dinner: 'yes', meal: 'Fish' }))).toEqual({
      error: 'That dinner option is not available.',
    })
    expect(updated()).toBeNull()
    await updateRsvpByToken(TOK, formData({ name: 'Pat', response: 'yes', dinner: 'no', meal: 'Beef' }))
    expect(updated()!.data).toMatchObject({ meal: '' })
    await updateRsvpByToken(TOK, formData({ name: 'Pat', response: 'yes', dinner: 'yes', meal: 'Chicken' }))
    expect(updated()!.data).toMatchObject({ meal: 'Chicken' })
  })

  it('keeps the stored meal when the event has been deleted', async () => {
    setup([rsvp({ name: 'Pat', meal: 'Beef' })], [])
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    await updateRsvpByToken(TOK, formData({ name: 'Pat', response: 'yes' }))
    expect(updated()!.data).toMatchObject({ meal: 'Beef' })
  })

  it('returns an error for an unknown token without throwing', async () => {
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    const result = await updateRsvpByToken(OTHER, formData({ name: 'New Name' }))
    expect(result).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(updated()).toBeNull()
  })

  it('an empty or short token never reaches the database (it could otherwise match many rows)', async () => {
    setup([rsvp({ editToken: '' }), rsvp({ id: 2, editToken: '' })])
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    for (const t of ['', 'x', undefined as unknown as string]) {
      expect(await updateRsvpByToken(t, formData({ name: 'Hijack' }))).toEqual({ error: 'This RSVP link is no longer valid.' })
    }
    expect(fake.callsTo('find', 'event-rsvps')).toHaveLength(0)
    expect(updated()).toBeNull()
  })

  it('rejects an empty name and over-long text', async () => {
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    expect(await updateRsvpByToken(TOK, formData({ name: '' }))).toEqual({ error: 'Name is required.' })
    expect(await updateRsvpByToken(TOK, formData({ name: 'P', email: 'x'.repeat(201) }))).toEqual({ error: 'Email must be 200 characters or fewer.' })
    expect(updated()).toBeNull()
  })

  it('rejects an email the collection would refuse (e.g. sam@localhost) with a message, not a throw', async () => {
    const { updateRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    expect(await updateRsvpByToken(TOK, formData({ name: 'Sam', email: 'sam@localhost' }))).toEqual({ error: 'Enter a valid email address, or leave it empty.' })
    expect(updated()).toBeNull()
  })
})

describe('cancelRsvpByToken', () => {
  it('deletes the matching row by id (no revalidation) and forgets it in the device cookie', async () => {
    cookieValue = JSON.stringify({ name: 'Pat', email: '', rsvps: { '5:2026-10-01T18:00:00.000Z': TOK, '6:x': OTHER } })
    const { cancelRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    const result = await cancelRsvpByToken(TOK)
    expect(result).toBeUndefined()
    const del = fake.callsTo('delete', 'event-rsvps')
    expect(del).toHaveLength(1)
    expect(del[0].args).toMatchObject({ id: 1, overrideAccess: true, context: { disableRevalidate: true } })
    expect(del[0].args).not.toHaveProperty('where')
    expect(fake.store['event-rsvps']).toHaveLength(0)
    expect(setCookie!.name).toBe(RSVP_COOKIE)
    expect(JSON.parse(setCookie!.value)).toEqual({ name: 'Pat', email: '', rsvps: { '6:x': OTHER } })
  })

  it('returns an error for an unknown or empty token', async () => {
    const { cancelRsvpByToken } = await import('@/app/(frontend)/events/rsvp/[token]/actions')
    expect(await cancelRsvpByToken(OTHER)).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(await cancelRsvpByToken('')).toEqual({ error: 'This RSVP link is no longer valid.' })
    expect(fake.callsTo('delete')).toHaveLength(0)
  })
})
