/**
 * events.int (spec §15; replaces events-admin-actions): branch nulling, required-per-type,
 * date normalisation and its idempotency (incl. a picker west of UTC), meal normalisation,
 * payment URL, cascade delete, the RSVP collection rules (token, meal rule, caps), the ETL
 * bypasses, and the public query layer against real Postgres.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'

const clock = vi.hoisted(() => ({ now: null as Date | null }))
vi.mock('@/lib/event-occurrences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/event-occurrences')>()
  return { ...actual, nowAsEventClock: (now?: Date) => (clock.now ? new Date(clock.now) : actual.nowAsEventClock(now)) }
})

const ctx = { disableRevalidate: true }
let payload: Payload
let editor: string

beforeAll(async () => {
  payload = await getTestPayload()
  for (const c of ['event-photos', 'event-rsvps', 'events'] as const) await clearCollection(payload, c)
  editor = await tokenFor(payload, 'editor', 'events-editor@example.com')
})

afterAll(async () => {
  await destroyTestPayload(payload)
})

const oneTime = (over: Record<string, unknown> = {}) => ({ type: 'one_time', title: 'Presentation Night', eventTime: '19:00', eventDate: '2026-11-15T00:00:00.000Z', ...over })
const recurring = (over: Record<string, unknown> = {}) => ({
  type: 'recurring',
  title: 'Thursday Training',
  eventTime: '18:00',
  dayOfWeek: '4',
  startDate: '2026-10-01T00:00:00.000Z',
  endDate: '2027-03-31T00:00:00.000Z',
  ...over,
})

describe('events: dates and branches (eventDates hook)', () => {
  it('a one-time event keeps its date and nulls the recurring fields (even the dayOfWeek default)', async () => {
    const res = await rest('POST', '/events', { token: editor, body: oneTime({ startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-02T00:00:00.000Z' }) })
    expect(res.status).toBe(201)
    expect(res.json.doc).toMatchObject({ type: 'one_time', eventDate: '2026-11-15T00:00:00.000Z', dayOfWeek: null, startDate: null, endDate: null })
  })

  it('a recurring event keeps its UTC-midnight dates and nulls eventDate', async () => {
    const res = await rest('POST', '/events', { token: editor, body: recurring({ eventDate: '2026-11-15T00:00:00.000Z' }) })
    expect(res.status).toBe(201)
    expect(res.json.doc).toMatchObject({ dayOfWeek: '4', startDate: '2026-10-01T00:00:00.000Z', endDate: '2027-03-31T00:00:00.000Z', eventDate: null })
  })

  it('snaps a picker value to UTC midnight of the club-timezone day, and is idempotent on re-save', async () => {
    // Melbourne local midnight (AEDT) for 16 Nov = 2026-11-15T13:00Z; local noon = 2026-11-16T01:00Z.
    const a = await rest('POST', '/events', { token: editor, body: oneTime({ eventDate: '2026-11-15T13:00:00.000Z' }) })
    expect(a.json.doc.eventDate).toBe('2026-11-16T00:00:00.000Z')
    const b = await rest('POST', '/events', { token: editor, body: recurring({ startDate: '2026-09-30T14:00:00.000Z', endDate: '2026-12-16T01:00:00.000Z' }) })
    expect(b.json.doc).toMatchObject({ startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-12-16T00:00:00.000Z' })
    const again = await rest('PATCH', `/events/${a.json.doc.id}`, { token: editor, body: { title: 'Renamed' } })
    expect(again.json.doc.eventDate).toBe('2026-11-16T00:00:00.000Z')
    const resent = await rest('PATCH', `/events/${a.json.doc.id}`, { token: editor, body: { eventDate: again.json.doc.eventDate } })
    expect(resent.json.doc.eventDate).toBe('2026-11-16T00:00:00.000Z')
    // Raw SQL: stored as UTC midnight (timestamptz).
    const { sql } = await import('@payloadcms/db-postgres/drizzle')
    const rows = (await payload.db.drizzle.execute(sql`SELECT start_date FROM payload.events WHERE id = ${b.json.doc.id}`)) as unknown as { rows: { start_date: Date | string }[] }
    expect(new Date(rows.rows[0].start_date).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('requires the date(s) for the chosen type', async () => {
    const noDate = await rest('POST', '/events', { token: editor, body: oneTime({ eventDate: null }) })
    expect(noDate.status).toBe(400)
    expect(JSON.stringify(noDate.json)).toContain('Date is required.')
    expect((await rest('POST', '/events', { token: editor, body: recurring({ endDate: null }) })).status).toBe(400)
    expect((await rest('POST', '/events', { token: editor, body: recurring({ dayOfWeek: null }) })).status).toBe(400)
    const backwards = await rest('POST', '/events', { token: editor, body: recurring({ startDate: '2027-01-01T00:00:00.000Z', endDate: '2026-12-01T00:00:00.000Z' }) })
    expect(backwards.status).toBe(400)
    expect((await rest('POST', '/events', { token: editor, body: oneTime({ title: '' }) })).status).toBe(400)
  })

  it('a partial PATCH is checked against the whole doc (switching type needs the other branch)', async () => {
    const e = await rest('POST', '/events', { token: editor, body: oneTime() })
    expect((await rest('PATCH', `/events/${e.json.doc.id}`, { token: editor, body: { type: 'recurring' } })).status).toBe(400)
    // dayOfWeek was nulled on the one-time doc; its create-time default does not come back on update.
    expect((await rest('PATCH', `/events/${e.json.doc.id}`, { token: editor, body: { type: 'recurring', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-31T00:00:00.000Z' } })).status).toBe(400)
    const ok = await rest('PATCH', `/events/${e.json.doc.id}`, { token: editor, body: { type: 'recurring', dayOfWeek: '4', startDate: '2026-10-01T00:00:00.000Z', endDate: '2026-10-31T00:00:00.000Z' } })
    expect(ok.status).toBe(200)
    expect(ok.json.doc).toMatchObject({ type: 'recurring', eventDate: null, dayOfWeek: '4' })
  })
})

describe('events: other fields', () => {
  it('normalises dinner options: trim, drop blanks, case-insensitive dedupe keeping the first spelling', async () => {
    const res = await rest('POST', '/events', {
      token: editor,
      body: oneTime({ mealOptions: [{ label: ' Beef ' }, { label: '' }, { label: 'Chicken' }, { label: 'beef' }, { label: 'Veggie ' }] }),
    })
    expect(res.status).toBe(201)
    expect(res.json.doc.mealOptions.map((m: { label: string }) => m.label)).toEqual(['Beef', 'Chicken', 'Veggie'])
  })

  it('accepts an empty or http(s) payment link and rejects anything else', async () => {
    expect((await rest('POST', '/events', { token: editor, body: oneTime({ paymentLinkUrl: 'https://square.link/u/abc' }) })).status).toBe(201)
    expect((await rest('POST', '/events', { token: editor, body: oneTime({ paymentLinkUrl: '' }) })).status).toBe(201)
    for (const bad of ['javascript:alert(1)', 'square.link/u/abc']) {
      const res = await rest('POST', '/events', { token: editor, body: oneTime({ paymentLinkUrl: bad }) })
      expect(res.status).toBe(400)
      expect(JSON.stringify(res.json)).toContain('Payment link must be a full http(s) URL.')
    }
  })

  it('validates eventTime as 24-hour HH:mm or empty', async () => {
    expect((await rest('POST', '/events', { token: editor, body: oneTime({ eventTime: '' }) })).status).toBe(201)
    expect((await rest('POST', '/events', { token: editor, body: oneTime({ eventTime: '7pm' }) })).status).toBe(400)
    expect((await rest('POST', '/events', { token: editor, body: oneTime({ eventTime: '24:00' }) })).status).toBe(400)
  })

  it('the ETL context keeps legacy values verbatim (dates, duplicate meals, any time text)', async () => {
    const doc = await payload.create({
      collection: 'events',
      data: {
        type: 'one_time',
        title: 'Legacy',
        eventTime: 'evening',
        eventDate: '2026-09-12T05:00:00.000Z',
        dayOfWeek: '3',
        mealOptions: [{ label: 'Parma' }, { label: 'Fish' }, { label: 'Parma' }],
        paymentLinkUrl: 'not a url',
      },
      context: { etl: true, ...ctx },
    })
    expect(doc).toMatchObject({ eventDate: '2026-09-12T05:00:00.000Z', dayOfWeek: '3', eventTime: 'evening', paymentLinkUrl: 'not a url' })
    expect(doc.mealOptions?.map((m) => m.label)).toEqual(['Parma', 'Fish', 'Parma'])
  })
})

describe('event-rsvps', () => {
  let eventId: number

  beforeAll(async () => {
    eventId = (await payload.create({ collection: 'events', data: oneTime({ mealOptions: [{ label: 'Beef' }] }) as never, context: ctx })).id
  })

  it('generates a UUID edit token on create, even from REST, and never lets anyone change it', async () => {
    const res = await rest('POST', '/event-rsvps', {
      token: editor,
      body: { event: eventId, occurrenceDate: '2026-11-15T19:00:00.000Z', name: 'Pat', editToken: 'chosen-by-client' },
    })
    expect(res.status).toBe(201)
    const token = res.json.doc.editToken as string
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    const patched = await rest('PATCH', `/event-rsvps/${res.json.doc.id}`, { token: editor, body: { editToken: 'stolen', name: 'Pat S' } })
    expect(patched.json.doc).toMatchObject({ name: 'Pat S', editToken: token })
    // Local API with overrideAccess (server actions): a supplied token is kept on create, reset on update.
    const local = await payload.create({ collection: 'event-rsvps', data: { event: eventId, occurrenceDate: '2026-11-15T19:00:00.000Z', name: 'Lee', editToken: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, context: ctx })
    expect(local.editToken).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    const upd = await payload.update({ collection: 'event-rsvps', id: local.id, data: { editToken: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, context: ctx })
    expect(upd.editToken).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('stores occurrenceDate verbatim to the millisecond', async () => {
    const doc = await payload.create({ collection: 'event-rsvps', data: { event: eventId, occurrenceDate: '2026-11-15T19:00:00.123Z', name: 'Ms' }, context: ctx })
    expect(doc.occurrenceDate).toBe('2026-11-15T19:00:00.123Z')
  })

  it('clears the meal on a "no" (admin-side meal rule)', async () => {
    const doc = await payload.create({ collection: 'event-rsvps', data: { event: eventId, occurrenceDate: '2026-11-15T19:00:00.000Z', name: 'No', response: 'no', meal: 'Beef' }, context: ctx })
    expect(doc.meal).toBe('')
    const yes = await payload.create({ collection: 'event-rsvps', data: { event: eventId, occurrenceDate: '2026-11-15T19:00:00.000Z', name: 'Yes', meal: 'Beef' }, context: ctx })
    const flipped = await payload.update({ collection: 'event-rsvps', id: yes.id, data: { response: 'no' }, context: ctx })
    expect(flipped.meal).toBe('')
  })

  it('caps text lengths and validates email; the ETL bypasses both', async () => {
    const base = { event: eventId, occurrenceDate: '2026-11-15T19:00:00.000Z' }
    expect((await rest('POST', '/event-rsvps', { token: editor, body: { ...base, name: 'x'.repeat(101) } })).status).toBe(400)
    expect((await rest('POST', '/event-rsvps', { token: editor, body: { ...base, name: 'A', note: 'x'.repeat(1001) } })).status).toBe(400)
    expect((await rest('POST', '/event-rsvps', { token: editor, body: { ...base, name: 'A', email: 'nope' } })).status).toBe(400)
    expect((await rest('POST', '/event-rsvps', { token: editor, body: { ...base, name: '' } })).status).toBe(400)
    const etl = await payload.create({
      collection: 'event-rsvps',
      data: { ...base, name: 'x'.repeat(150), email: 'legacy-not-an-email', editToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
      context: { etl: true, ...ctx },
    })
    expect(etl).toMatchObject({ email: 'legacy-not-an-email', editToken: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })
  })
})

describe('cascade delete', () => {
  it('deleting an event deletes its RSVPs and photos (one transaction), not other events\'', async () => {
    const keep = await payload.create({ collection: 'events', data: oneTime({ title: 'Keep' }) as never, context: ctx })
    const gone = await payload.create({ collection: 'events', data: oneTime({ title: 'Gone' }) as never, context: ctx })
    for (const ev of [keep, gone]) {
      await payload.create({ collection: 'event-rsvps', data: { event: ev.id, occurrenceDate: '2026-11-15T19:00:00.000Z', name: 'R' }, context: ctx })
      await payload.create({ collection: 'event-photos', data: { event: ev.id, caption: 'p', status: 'pending' }, context: ctx })
    }
    const res = await rest('DELETE', `/events/${gone.id}`, { token: editor })
    expect(res.status).toBe(200)
    expect(await payload.count({ collection: 'event-rsvps', where: { event: { equals: gone.id } } })).toEqual({ totalDocs: 0 })
    expect(await payload.count({ collection: 'event-photos', where: { event: { equals: gone.id } } })).toEqual({ totalDocs: 0 })
    expect(await payload.count({ collection: 'event-rsvps', where: { event: { equals: keep.id } } })).toEqual({ totalDocs: 1 })
    expect(await payload.count({ collection: 'event-photos', where: { event: { equals: keep.id } } })).toEqual({ totalDocs: 1 })
  })
})

describe('public query layer against Postgres (lib/events-queries)', () => {
  let one: number
  let series: number

  beforeAll(async () => {
    for (const c of ['event-photos', 'event-rsvps', 'events'] as const) await clearCollection(payload, c)
    one = (await payload.create({ collection: 'events', data: oneTime({ eventDate: '2026-11-05T00:00:00.000Z', eventTime: '18:00' }) as never, context: ctx })).id
    series = (await payload.create({ collection: 'events', data: recurring({ dayOfWeek: '4' }) as never, context: ctx })).id
    const rsvp = (event: number, occurrenceDate: string, response: 'yes' | 'no') =>
      payload.create({ collection: 'event-rsvps', data: { event, occurrenceDate, name: 'N', response }, context: ctx })
    await rsvp(one, '2026-11-05T18:00:00.000Z', 'yes')
    await rsvp(one, '2026-11-05T18:00:00.000Z', 'yes')
    await rsvp(one, '2026-11-05T18:00:00.000Z', 'no')
    await rsvp(series, '2026-11-05T18:00:00.000Z', 'yes')
    await rsvp(series, '2026-11-12T18:00:00.000Z', 'yes')
    await rsvp(series, '2026-10-01T18:00:00.000Z', 'yes')
    clock.now = new Date('2026-11-01T09:00:00.000Z')
  })

  afterAll(() => {
    clock.now = null
  })

  it('getRsvpTally matches one occurrence at millisecond precision', async () => {
    const { getRsvpTally } = await import('@/lib/events-queries')
    expect(await getRsvpTally(one, new Date('2026-11-05T18:00:00.000Z'))).toEqual({ yes: 2, no: 1 })
    expect(await getRsvpTally(one, new Date('2026-11-05T18:00:00.001Z'))).toEqual({ yes: 0, no: 0 })
    expect(await getRsvpTally(series, new Date('2026-11-12T18:00:00.000Z'))).toEqual({ yes: 1, no: 0 })
  })

  it('listGoingCounts groups future yes answers per event + occurrence', async () => {
    const { listGoingCounts } = await import('@/lib/events-queries')
    const counts = await listGoingCounts()
    expect(Object.fromEntries(counts)).toEqual({
      [`${one}:2026-11-05T18:00:00.000Z`]: 2,
      [`${series}:2026-11-05T18:00:00.000Z`]: 1,
      [`${series}:2026-11-12T18:00:00.000Z`]: 1,
    })
  })

  it('listUpcomingItems / getEventById map docs to the domain shape', async () => {
    const { getEventById, listUpcomingItems } = await import('@/lib/events-queries')
    const items = await listUpcomingItems()
    expect(items.map((i) => [i.event.id, i.occurrenceDate.toISOString()])).toEqual([
      [one, '2026-11-05T18:00:00.000Z'],
      [series, '2026-11-05T18:00:00.000Z'],
    ])
    const e = await getEventById(series)
    expect(e).toMatchObject({ type: 'recurring', dayOfWeek: 4, eventDate: null, coverImageUrl: '', mealOptions: [] })
    expect(e).not.toHaveProperty('rsvps')
    expect(e).not.toHaveProperty('photos')
  })

  it('getRsvpByToken finds a row by token and never exposes the token in the domain shape', async () => {
    const row = await payload.create({ collection: 'event-rsvps', data: { event: one, occurrenceDate: '2026-11-05T18:00:00.000Z', name: 'Tok' }, context: ctx })
    const { getRsvpByToken } = await import('@/lib/events-queries')
    const found = await getRsvpByToken(row.editToken as string)
    expect(found).toMatchObject({ id: row.id, eventId: one, name: 'Tok' })
    expect(found).not.toHaveProperty('editToken')
    expect(await getRsvpByToken('')).toBeNull()
  })
})
