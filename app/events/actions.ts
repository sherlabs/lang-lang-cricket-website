'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, eventRsvps, type Event } from '@/db/schema'
import { getOccurrences, getOneTimeEventDateTime } from '@/lib/event-occurrences'
import { generateStoryToken } from '@/lib/story-tokens'
import { RSVP_COOKIE } from '@/lib/rsvp-cookie'

/** Confirms `occurrenceDate` is a real occurrence of `event` — the only server-side check standing between a crafted request and an RSVP for a date that was never actually offered. */
function isValidOccurrence(event: Event, occurrenceDate: Date): boolean {
  if (event.type === 'one_time') {
    if (!event.eventDate) return false
    return getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }).getTime() === occurrenceDate.getTime()
  }
  if (event.dayOfWeek == null || !event.startDate || !event.endDate) return false
  const occurrences = getOccurrences(
    { dayOfWeek: event.dayOfWeek, eventTime: event.eventTime, startDate: event.startDate, endDate: event.endDate },
    { from: event.startDate, to: event.endDate }
  )
  return occurrences.some((d) => d.getTime() === occurrenceDate.getTime())
}

export async function submitRsvp(formData: FormData): Promise<{ error: string } | void> {
  const eventId = Number(formData.get('eventId'))
  const occurrenceDateStr = String(formData.get('occurrenceDate') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  const rows = await db.select().from(events).where(eq(events.id, eventId))
  const event = (rows[0] as Event | undefined) ?? null
  if (!event) return { error: 'Event not found.' }

  if (!name) return { error: 'Name is required.' }

  const occurrenceDate = new Date(occurrenceDateStr)
  if (Number.isNaN(occurrenceDate.getTime()) || !isValidOccurrence(event, occurrenceDate)) {
    return { error: 'That date is not available for this event.' }
  }

  const editToken = generateStoryToken()

  await db.insert(eventRsvps).values({ eventId, occurrenceDate, name, email, note, editToken })

  cookies().set(RSVP_COOKIE, JSON.stringify({ eventTitle: event.title, editToken }), {
    maxAge: 60 * 60 * 24 * 180,
    path: '/',
    sameSite: 'lax',
  })

  revalidatePath('/admin/events')
}
