'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, eventRsvps, type Event, type EventRsvp } from '@/db/schema'
import { getOccurrences, getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { generateStoryToken } from '@/lib/story-tokens'
import {
  RSVP_COOKIE,
  parseRsvpCookie,
  rsvpCookieOptions,
  rsvpKey,
  serializeRsvpCookie,
  upsertRsvpMemory,
} from '@/lib/rsvp-cookie'
import { isRsvpResponse } from '@/lib/rsvp-response'
import { eventMealOptions, resolveMeal } from '@/lib/events-meal'

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

/**
 * Parses and validates the occurrence string. Both failure modes (not an
 * occurrence at all, or one already in the past) get the same generic message —
 * no oracle telling an attacker *why* a date was rejected.
 */
function parseOccurrence(event: Event, raw: string): Date | null {
  const occurrenceDate = new Date(raw)
  if (Number.isNaN(occurrenceDate.getTime()) || !isValidOccurrence(event, occurrenceDate)) return null
  if (occurrenceDate < nowAsEventClock()) return null
  return occurrenceDate
}

export type SubmitRsvpResult = { error: string } | { ok: true; response: 'yes' | 'no' }

/**
 * Creates or updates this device's RSVP for one occurrence. "This device" is the
 * httpOnly memory cookie: if it already holds a token for the occurrence and that
 * row still exists, the row is updated in place — never a second row.
 *
 * Fields: eventId, occurrenceDate (ISO), response ('yes' | 'no'), name (required),
 * email, dinner ('yes' | 'no', only when the event has meal options and response is
 * 'yes'), meal (one of the event's options when dinner is 'yes'), note.
 */
export async function submitRsvp(formData: FormData): Promise<SubmitRsvpResult> {
  const eventId = Number(formData.get('eventId'))
  const occurrenceDateStr = String(formData.get('occurrenceDate') ?? '')
  const response = String(formData.get('response') ?? 'yes')
  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  const dinner = String(formData.get('dinner') ?? '')
  const rawMeal = String(formData.get('meal') ?? '')

  const rows = await db.select().from(events).where(eq(events.id, eventId))
  const event = (rows[0] as Event | undefined) ?? null
  if (!event) return { error: 'Event not found.' }

  if (!name) return { error: 'Name is required.' }
  if (!isRsvpResponse(response)) return { error: 'Please choose yes or no.' }

  const occurrenceDate = parseOccurrence(event, occurrenceDateStr)
  if (!occurrenceDate) return { error: 'That date is not available for this event.' }

  const mealResult = resolveMeal(response, { dinner, meal: rawMeal }, eventMealOptions(event))
  if ('error' in mealResult) return { error: mealResult.error }
  const meal = mealResult.meal

  const jar = await cookies()
  const memory = parseRsvpCookie(jar.get(RSVP_COOKIE)?.value)
  const key = rsvpKey(eventId, occurrenceDate)

  // Reuse the row this device already made for the occurrence, if it still exists
  // and really belongs to this event (a stale/forged cookie must not let someone
  // rewrite a row for a different event).
  let editToken = memory.rsvps[key] ?? ''
  let existing: EventRsvp | null = null
  if (editToken) {
    const found = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, editToken))
    const row = (found[0] as EventRsvp | undefined) ?? null
    existing = row && row.eventId === eventId ? row : null
  }

  if (existing) {
    await db.update(eventRsvps).set({ name, email, note, response, meal }).where(eq(eventRsvps.editToken, editToken))
  } else {
    editToken = generateStoryToken()
    await db.insert(eventRsvps).values({ eventId, occurrenceDate, name, email, note, response, meal, editToken })
  }

  jar.set(RSVP_COOKIE, serializeRsvpCookie(upsertRsvpMemory(memory, key, editToken, { name, email })), rsvpCookieOptions())

  revalidatePath('/events')
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath('/admin/events')

  return { ok: true, response }
}
