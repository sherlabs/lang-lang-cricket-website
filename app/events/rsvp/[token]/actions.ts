'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, eventRsvps, type Event, type EventRsvp } from '@/db/schema'
import { RSVP_COOKIE, parseRsvpCookie, removeRsvpToken, rsvpCookieOptions, serializeRsvpCookie } from '@/lib/rsvp-cookie'
import { isRsvpResponse, type RsvpResponse } from '@/lib/rsvp-response'
import { eventMealOptions, resolveMeal } from '@/lib/events-meal'

export async function getRsvpByToken(token: string): Promise<EventRsvp | null> {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  return (rows[0] as EventRsvp | undefined) ?? null
}

/**
 * Fields: name (required), email, note, response ('yes' | 'no' — absent/invalid keeps
 * the stored answer), dinner + meal (same rule as submitRsvp; when the event has been
 * deleted there are no options to check against, so the stored meal is kept).
 */
export async function updateRsvpByToken(token: string, formData: FormData): Promise<{ error: string } | void> {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  const rsvp = (rows[0] as EventRsvp | undefined) ?? null
  if (!rsvp) return { error: 'This RSVP link is no longer valid.' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required.' }

  const rawResponse = formData.get('response')
  const stored: RsvpResponse = isRsvpResponse(rsvp.response) ? rsvp.response : 'yes'
  const response: RsvpResponse = isRsvpResponse(rawResponse) ? rawResponse : stored

  const eventRows = await db.select().from(events).where(eq(events.id, rsvp.eventId))
  const event = (eventRows[0] as Event | undefined) ?? null

  let meal = rsvp.meal ?? ''
  if (response === 'no') {
    meal = ''
  } else if (event) {
    const result = resolveMeal(response, { dinner: String(formData.get('dinner') ?? ''), meal: String(formData.get('meal') ?? '') }, eventMealOptions(event))
    if ('error' in result) return { error: result.error }
    meal = result.meal
  }

  await db
    .update(eventRsvps)
    .set({
      name,
      email: String(formData.get('email') ?? '').trim(),
      note: String(formData.get('note') ?? '').trim(),
      response,
      meal,
    })
    .where(eq(eventRsvps.editToken, token))

  revalidatePath('/events')
  revalidatePath(`/events/${rsvp.eventId}`)
  revalidatePath(`/admin/events/${rsvp.eventId}`)
  revalidatePath('/admin/events')
}

export async function cancelRsvpByToken(token: string): Promise<{ error: string } | void> {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  const rsvp = (rows[0] as EventRsvp | undefined) ?? null
  if (!rsvp) return { error: 'This RSVP link is no longer valid.' }

  await db.delete(eventRsvps).where(eq(eventRsvps.editToken, token))

  // Forget it on this device too, so the event page goes back to "not responded".
  // A cookie write alone does not make Next re-render the mounted route (only
  // revalidatePath does — see below), so the "cancelled" card still paints.
  const jar = cookies()
  const memory = parseRsvpCookie(jar.get(RSVP_COOKIE)?.value)
  jar.set(RSVP_COOKIE, serializeRsvpCookie(removeRsvpToken(memory, token)), rsvpCookieOptions())

  // No revalidatePath here. Any revalidate call inside a server action re-renders the CURRENTLY
  // MOUNTED route (this RSVP page), not just the literal path argument — with the row gone that
  // render hits notFound(), which would replace the "cancelled" card with a 404 before it can paint.
  // Dropping the call is safe: fresh reads on the public and admin pages come from the Neon
  // client's `cache: 'no-store'` config (db/index.ts) plus unstable_noStore() on those pages.
}
