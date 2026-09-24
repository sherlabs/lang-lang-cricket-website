import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, type Event } from '@/db/schema'
import { getOccurrences, getOneTimeEventDateTime } from './event-occurrences'

export type UpcomingItem = { event: Event; occurrenceDate: Date }

const UPCOMING_WEEKS_AHEAD = 6

export async function listUpcomingItems(): Promise<UpcomingItem[]> {
  const all = (await db.select().from(events)) as Event[]
  const now = new Date()
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
      )
      for (const occurrenceDate of occurrences) items.push({ event, occurrenceDate })
    }
  }

  return items.sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime())
}

export async function listPastOneTimeEvents(): Promise<Event[]> {
  const all = (await db.select().from(events).where(eq(events.type, 'one_time'))) as Event[]
  const now = new Date()
  return all
    .filter((e) => e.eventDate && getOneTimeEventDateTime({ eventDate: e.eventDate, eventTime: e.eventTime }) < now)
    .sort((a, b) => (b.eventDate?.getTime() ?? 0) - (a.eventDate?.getTime() ?? 0))
}

export async function getEventById(id: number): Promise<Event | null> {
  const rows = await db.select().from(events).where(eq(events.id, id))
  return (rows[0] as Event | undefined) ?? null
}
