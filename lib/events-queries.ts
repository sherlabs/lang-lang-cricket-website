import 'server-only'
import type { Where } from 'payload'
import type { Event, EventPhoto, EventRsvp } from '@/lib/domain'
import { getPayloadClient } from '@/lib/payload/client'
import { toEvent, toEventRsvp } from '@/lib/payload/mappers'
import { isTokenShaped } from '@/lib/story-tokens'
import { getOccurrences, getOneTimeEventDateTime, nowAsEventClock } from './event-occurrences'
import { rsvpKey, type RsvpMemory } from './rsvp-cookie'
import { isRsvpResponse, type RsvpResponse, type RsvpTally } from './rsvp-response'

/**
 * Public event reads (spec §14). The Local API runs with overrideAccess, so:
 * - every `events` read passes `joins: false` (the `rsvps`/`photos` joins would load tokens,
 *   emails and pending photos);
 * - photo reads filter `status: approved` themselves;
 * - RSVPs are only ever counted, or looked up by a token-shaped edit token.
 * Every comparison against "now" uses `nowAsEventClock()` (wall-clock-as-UTC).
 */

export type UpcomingItem = { event: Event; occurrenceDate: Date }

const UPCOMING_WEEKS_AHEAD = 6

async function findEvents(where?: Where): Promise<Event[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'events',
    ...(where ? { where } : {}),
    sort: 'id',
    pagination: false,
    depth: 1,
    joins: false,
  })
  return docs.map(toEvent)
}

export async function listUpcomingItems(): Promise<UpcomingItem[]> {
  const all = await findEvents()
  const now = nowAsEventClock()
  const items: UpcomingItem[] = []

  for (const event of all) {
    if (event.type === 'one_time') {
      if (!event.eventDate) continue
      const dt = getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime })
      if (dt >= now) items.push({ event, occurrenceDate: dt })
    } else if (event.type === 'recurring') {
      if (event.dayOfWeek == null || !event.startDate || !event.endDate) continue
      const occurrences = getOccurrences(
        { dayOfWeek: event.dayOfWeek, eventTime: event.eventTime, startDate: event.startDate, endDate: event.endDate },
        { from: now, to: new Date(now.getTime() + UPCOMING_WEEKS_AHEAD * 7 * 24 * 60 * 60 * 1000) }
      ).filter((occurrenceDate) => occurrenceDate >= now)
      // Only the single next occurrence is shown in "Upcoming" — a weekly
      // series would otherwise produce a card per week within the window.
      const next = occurrences[0]
      if (next) items.push({ event, occurrenceDate: next })
    }
  }

  return items.sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime())
}

export async function listPastOneTimeEvents(): Promise<Event[]> {
  const all = await findEvents({ type: { equals: 'one_time' } })
  const now = nowAsEventClock()
  return all
    .filter((e) => e.eventDate && getOneTimeEventDateTime({ eventDate: e.eventDate, eventTime: e.eventTime }) < now)
    .sort((a, b) => (b.eventDate?.getTime() ?? 0) - (a.eventDate?.getTime() ?? 0))
}

export async function getEventById(id: number): Promise<Event | null> {
  if (!Number.isInteger(id) || id <= 0) return null
  const [event] = await findEvents({ id: { equals: id } })
  return event ?? null
}

/**
 * Recap photos for a past event, in admin sort order. Public: only ever
 * returns approved photos — a publicly submitted photo that hasn't been
 * approved by an admin must never appear here.
 */
export async function getEventPhotosPublic(eventId: number): Promise<EventPhoto[]> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'event-photos',
    where: { and: [{ event: { equals: eventId } }, { status: { equals: 'approved' } }] },
    sort: ['sortOrder', 'id'],
    pagination: false,
    depth: 0,
  })
  return docs.filter((d) => d.url).map((d) => ({ url: d.url as string }))
}

/** Public tally for one occurrence — counts only, never names/emails/notes. */
export async function getRsvpTally(eventId: number, occurrenceDate: Date): Promise<RsvpTally> {
  const payload = await getPayloadClient()
  const count = async (response: RsvpResponse) =>
    (
      await payload.count({
        collection: 'event-rsvps',
        where: {
          and: [
            { event: { equals: eventId } },
            { occurrenceDate: { equals: occurrenceDate.toISOString() } },
            { response: { equals: response } },
          ],
        },
      })
    ).totalDocs
  const [yes, no] = await Promise.all([count('yes'), count('no')])
  return { yes, no }
}

/**
 * "Going" counts for every future occurrence, keyed by `rsvpKey(eventId, occurrenceDate)` —
 * for the small pill on the upcoming cards. Grouped in JS over a narrow `select`.
 */
export async function listGoingCounts(): Promise<Map<string, number>> {
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'event-rsvps',
    where: {
      and: [{ response: { equals: 'yes' } }, { occurrenceDate: { greater_than_equal: nowAsEventClock().toISOString() } }],
    },
    select: { event: true, occurrenceDate: true },
    pagination: false,
    depth: 0,
  })
  const counts = new Map<string, number>()
  for (const d of docs) {
    const eventId = typeof d.event === 'number' ? d.event : d.event?.id
    if (!eventId || !d.occurrenceDate) continue
    const key = rsvpKey(eventId, new Date(d.occurrenceDate))
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * The RSVP behind an edit link. Server-only (no longer a callable server action). A token
 * that is not UUID-shaped never reaches the database.
 */
export async function getRsvpByToken(token: string): Promise<EventRsvp | null> {
  if (!isTokenShaped(token)) return null
  const payload = await getPayloadClient()
  const { docs } = await payload.find({
    collection: 'event-rsvps',
    where: { editToken: { equals: token } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ? toEventRsvp(docs[0]) : null
}

/** What this device already answered for an occurrence — server-side only; the token never reaches the client. */
export type DeviceRsvp = {
  token: string
  response: RsvpResponse
  name: string
  email: string
  meal: string
  note: string
}

/**
 * Looks up the RSVP the device cookie remembers for `eventId` + `occurrenceDate`.
 * Null when the cookie has nothing for it, or the row is gone (admin deleted it) or
 * belongs to another event — either way the device is treated as "not responded".
 */
export async function getDeviceRsvp(memory: RsvpMemory, eventId: number, occurrenceDate: Date): Promise<DeviceRsvp | null> {
  const token = memory.rsvps[rsvpKey(eventId, occurrenceDate)]
  if (!token) return null
  const row = await getRsvpByToken(token)
  if (!row || row.eventId !== eventId) return null
  return {
    token,
    response: isRsvpResponse(row.response) ? row.response : 'yes',
    name: row.name,
    email: row.email,
    meal: row.meal,
    note: row.note,
  }
}
