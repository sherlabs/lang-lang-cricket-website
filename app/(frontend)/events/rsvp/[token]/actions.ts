'use server'

import { cookies } from 'next/headers'
import { getEventById, getRsvpByToken } from '@/lib/events-queries'
import { getPayloadClient } from '@/lib/payload/client'
import { RSVP_COOKIE, parseRsvpCookie, removeRsvpToken, rsvpCookieOptions, serializeRsvpCookie } from '@/lib/rsvp-cookie'
import { isRsvpResponse, type RsvpResponse } from '@/lib/rsvp-response'
import { eventMealOptions, resolveMeal } from '@/lib/events-meal'
import { rsvpTextError } from '@/lib/rsvp-validation'

const INVALID_LINK = { error: 'This RSVP link is no longer valid.' }

/**
 * Token-keyed writes (spec §6): the token must be UUID-shaped (`getRsvpByToken` refuses
 * anything else), the row is found with a `limit: 1` lookup, and the write goes by `id` —
 * never by `where`, which under overrideAccess could match many rows. `data` is built from an
 * allowlist of form keys.
 *
 * Fields: name (required), email, note, response ('yes' | 'no' — absent/invalid keeps
 * the stored answer), dinner + meal (same rule as submitRsvp; when the event has been
 * deleted there are no options to check against, so the stored meal is kept).
 */
export async function updateRsvpByToken(token: string, formData: FormData): Promise<{ error: string } | void> {
  const rsvp = await getRsvpByToken(token)
  if (!rsvp) return INVALID_LINK

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required.' }
  const email = String(formData.get('email') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()
  // Checked before the write: the collection validators would otherwise throw a ValidationError.
  const textError = rsvpTextError({ name, email, note })
  if (textError) return { error: textError }

  const rawResponse = formData.get('response')
  const stored: RsvpResponse = isRsvpResponse(rsvp.response) ? rsvp.response : 'yes'
  const response: RsvpResponse = isRsvpResponse(rawResponse) ? rawResponse : stored

  const event = await getEventById(rsvp.eventId)

  let meal = rsvp.meal
  if (response === 'no') {
    meal = ''
  } else if (event) {
    const result = resolveMeal(response, { dinner: String(formData.get('dinner') ?? ''), meal: String(formData.get('meal') ?? '') }, eventMealOptions(event))
    if ('error' in result) return { error: result.error }
    meal = result.meal
  }

  const payload = await getPayloadClient()
  // The collection hook revalidates /events and /events/<id>.
  await payload.update({ collection: 'event-rsvps', id: rsvp.id, data: { name, email, note, response, meal }, overrideAccess: true, depth: 0 })
}

export async function cancelRsvpByToken(token: string): Promise<{ error: string } | void> {
  const rsvp = await getRsvpByToken(token)
  if (!rsvp) return INVALID_LINK

  const payload = await getPayloadClient()
  // No revalidation here (disableRevalidate skips the collection hook too). Any revalidate call
  // inside a server action re-renders the CURRENTLY MOUNTED route (this RSVP page), not just the
  // literal path — with the row gone that render hits notFound(), which would replace the
  // "cancelled" card with a 404 before it can paint. Safe to skip: the reading pages are
  // force-dynamic and the Local API (pg) has no fetch cache, so every render reads fresh rows.
  await payload.delete({ collection: 'event-rsvps', id: rsvp.id, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })

  // Forget it on this device too, so the event page goes back to "not responded".
  const jar = await cookies()
  const memory = parseRsvpCookie(jar.get(RSVP_COOKIE)?.value)
  jar.set(RSVP_COOKIE, serializeRsvpCookie(removeRsvpToken(memory, token)), rsvpCookieOptions())
}
