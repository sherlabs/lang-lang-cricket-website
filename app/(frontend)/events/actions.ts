'use server'

import { cookies } from 'next/headers'
import type { Event } from '@/lib/domain'
import { getOccurrences, getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { getEventById, getRsvpByToken } from '@/lib/events-queries'
import { getPayloadClient } from '@/lib/payload/client'
import { generateStoryToken, isTokenShaped } from '@/lib/story-tokens'
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
import { rsvpTextError } from '@/lib/rsvp-validation'

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

  const event = await getEventById(eventId)
  if (!event) return { error: 'Event not found.' }

  if (!name) return { error: 'Name is required.' }
  if (!isRsvpResponse(response)) return { error: 'Please choose yes or no.' }
  const capError = rsvpTextError({ name, email, note })
  if (capError) return { error: capError }

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
  // rewrite a row for a different event). Looked up by token, written by id.
  const remembered = memory.rsvps[key] ?? ''
  const existing = isTokenShaped(remembered) ? await getRsvpByToken(remembered) : null
  const reuse = existing && existing.eventId === eventId ? existing : null

  const payload = await getPayloadClient()
  // Allowlisted data only; the collection hooks revalidate /events and /events/<id>.
  const data = { name, email, note, response, meal }
  let editToken: string
  if (reuse) {
    await payload.update({ collection: 'event-rsvps', id: reuse.id, data, overrideAccess: true, depth: 0 })
    editToken = remembered
  } else {
    const created = await payload.create({
      collection: 'event-rsvps',
      data: { ...data, event: eventId, occurrenceDate: occurrenceDate.toISOString(), editToken: generateStoryToken() },
      overrideAccess: true,
      depth: 0,
    })
    editToken = created.editToken as string
  }

  jar.set(RSVP_COOKIE, serializeRsvpCookie(upsertRsvpMemory(memory, key, editToken, { name, email })), rsvpCookieOptions())

  return { ok: true, response }
}
