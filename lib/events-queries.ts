import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/db'
import { events, eventPhotos, eventRsvps, type Event, type EventRsvp } from '@/db/schema'
import { getOccurrences, getOneTimeEventDateTime, nowAsEventClock } from './event-occurrences'
import { rsvpKey, type RsvpMemory } from './rsvp-cookie'
import { isRsvpResponse, type RsvpResponse, type RsvpTally } from './rsvp-response'

export type UpcomingItem = { event: Event; occurrenceDate: Date }

const UPCOMING_WEEKS_AHEAD = 6

export async function listUpcomingItems(): Promise<UpcomingItem[]> {
  const all = (await db.select().from(events)) as Event[]
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
  const all = (await db.select().from(events).where(eq(events.type, 'one_time'))) as Event[]
  const now = nowAsEventClock()
  return all
    .filter((e) => e.eventDate && getOneTimeEventDateTime({ eventDate: e.eventDate, eventTime: e.eventTime }) < now)
    .sort((a, b) => (b.eventDate?.getTime() ?? 0) - (a.eventDate?.getTime() ?? 0))
}

export async function getEventById(id: number): Promise<Event | null> {
  const rows = await db.select().from(events).where(eq(events.id, id))
  return (rows[0] as Event | undefined) ?? null
}

/**
 * Recap photos for a past event, in admin sort order. Public: only ever
 * returns approved photos — a publicly submitted photo that hasn't been
 * approved by an admin must never appear here.
 */
export async function getEventPhotosPublic(eventId: number): Promise<{ url: string }[]> {
  return db
    .select({ url: eventPhotos.url })
    .from(eventPhotos)
    .where(and(eq(eventPhotos.eventId, eventId), eq(eventPhotos.status, 'approved')))
    .orderBy(asc(eventPhotos.sortOrder), asc(eventPhotos.id))
}

/** Public tally for one occurrence — counts only, never names/emails/notes. */
export async function getRsvpTally(eventId: number, occurrenceDate: Date): Promise<RsvpTally> {
  const rows = (await db
    .select({ response: eventRsvps.response, count: sql<number>`count(*)` })
    .from(eventRsvps)
    .where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.occurrenceDate, occurrenceDate)))
    .groupBy(eventRsvps.response)) as { response: string; count: number }[]
  const tally: RsvpTally = { yes: 0, no: 0 }
  for (const row of rows) {
    if (isRsvpResponse(row.response)) tally[row.response] += Number(row.count)
  }
  return tally
}

/**
 * "Going" counts for every future occurrence in one grouped query, keyed by
 * `rsvpKey(eventId, occurrenceDate)` — for the small pill on the upcoming cards.
 */
export async function listGoingCounts(): Promise<Map<string, number>> {
  const rows = (await db
    .select({ eventId: eventRsvps.eventId, occurrenceDate: eventRsvps.occurrenceDate, count: sql<number>`count(*)` })
    .from(eventRsvps)
    .where(and(eq(eventRsvps.response, 'yes'), gte(eventRsvps.occurrenceDate, nowAsEventClock())))
    .groupBy(eventRsvps.eventId, eventRsvps.occurrenceDate)) as { eventId: number; occurrenceDate: Date; count: number }[]
  return new Map(rows.map((r) => [rsvpKey(r.eventId, r.occurrenceDate), Number(r.count)]))
}

export async function getRsvpByToken(token: string): Promise<EventRsvp | null> {
  if (!token) return null
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  return (rows[0] as EventRsvp | undefined) ?? null
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
    meal: row.meal ?? '',
    note: row.note,
  }
}
