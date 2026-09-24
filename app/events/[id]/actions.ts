'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { events, eventPhotos, type Event } from '@/db/schema'
import { getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { isBlobUrl } from '@/lib/blob-url'

/**
 * Public, no-login submission of a recap photo for a past one-time event
 * (see docs/superpowers/specs/2026-09-24-events-design.md for the "no heavy
 * auth" stance this feature follows throughout). Inserted with
 * `status: 'pending'` — it only becomes publicly visible once an admin calls
 * `approveEventPhoto` (app/admin/(shell)/events/photo-actions.ts).
 *
 * Only one-time events that have already happened accept submissions,
 * matching the "recap photo" framing: a recurring series has no per-occurrence
 * recap-photo concept (per the design spec). A future or nonexistent event
 * both get the same rejection shape as `submitRsvp`'s validity checks
 * (distinct messages per case, matching that action's existing convention).
 */
export async function submitEventPhoto(formData: FormData): Promise<{ error: string } | void> {
  const eventId = Number(formData.get('eventId'))
  const url = String(formData.get('url') ?? '').trim()
  const submitterName = String(formData.get('submitterName') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()

  const rows = await db.select().from(events).where(eq(events.id, eventId))
  const event = (rows[0] as Event | undefined) ?? null

  const isPastOneTime =
    !!event && event.type === 'one_time' && !!event.eventDate && getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) < nowAsEventClock()

  if (!event) return { error: 'Event not found.' }
  if (!isPastOneTime) return { error: 'Photos can only be submitted for a past event.' }
  // Not just "is this any Blob URL" — it must be one this action's own public
  // upload route (/api/events/upload) actually minted, under events/pending/.
  // Otherwise a crafted submission could point at an unrelated blob (another
  // event's approved recap photo, a sponsor logo, ...) and get it deleted
  // later via rejectEventPhoto's del() call — a cross-entity deletion vector.
  if (!url || !isBlobUrl(url) || !isPendingEventBlobPath(url)) return { error: 'A photo is required.' }

  await db.insert(eventPhotos).values({ eventId, url, caption, submitterName, status: 'pending' })

  revalidatePath('/admin/events')
}

function isPendingEventBlobPath(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/^\//, '').startsWith('events/pending/')
  } catch {
    return false
  }
}
