'use server'

import { head } from '@vercel/blob'
import { ValidationError } from 'payload'
import { getOneTimeEventDateTime, nowAsEventClock } from '@/lib/event-occurrences'
import { blobPathParts, blobStoreId, isOwnBlobUrl } from '@/lib/blob-url'
import { getEventById } from '@/lib/events-queries'
import { getPayloadClient } from '@/lib/payload/client'
import { blobToken } from '@/payload/env'

/** The folder the public upload route (/api/public/events/upload) writes to. */
const PENDING_PREFIX = 'events/pending'

// Unauthenticated public action — cap free-text fields so no one can stuff
// megabytes of text into a caption/name via a raw form post.
const MAX_TEXT_LENGTH = 200

/**
 * Public, no-login submission of a recap photo for a past one-time event. The photo was
 * already uploaded from the browser to Blob under `events/pending/` (public upload route);
 * this registers that existing blob as a `pending` `event-photos` doc (spec §6, §7.4 recipe:
 * no `url`, focal point 50/50). It only becomes public once an admin approves it.
 *
 * Only one-time events that have already happened accept submissions, matching the "recap
 * photo" framing: a recurring series has no per-occurrence recap concept.
 */
export async function submitEventPhoto(formData: FormData): Promise<{ error: string } | void> {
  const eventId = Number(formData.get('eventId'))
  const url = String(formData.get('url') ?? '').trim()
  const submitterName = String(formData.get('submitterName') ?? '').trim().slice(0, MAX_TEXT_LENGTH)
  const caption = String(formData.get('caption') ?? '').trim().slice(0, MAX_TEXT_LENGTH)

  if (!Number.isInteger(eventId) || eventId <= 0) return { error: 'Event not found.' }

  const event = await getEventById(eventId)
  if (!event) return { error: 'Event not found.' }

  // Known limitation: this schema has no end-time/duration, so an event that
  // started but hasn't "ended" is already treated as "past" and eligible here,
  // same as listPastOneTimeEvents.
  const isPastOneTime =
    event.type === 'one_time' && !!event.eventDate && getOneTimeEventDateTime({ eventDate: event.eventDate, eventTime: event.eventTime }) < nowAsEventClock()
  if (!isPastOneTime) return { error: 'Photos can only be submitted for a past event.' }

  // Must be a blob THIS project's store minted (not just any *.blob.vercel-storage.com URL —
  // anyone could otherwise point at a file they control and swap it after approval), directly
  // under events/pending/ (so a crafted submission cannot claim another entity's blob, which
  // rejecting would then delete), with a safe basename.
  const token = blobToken()
  if (!url || !isOwnBlobUrl(url, { storeId: blobStoreId(token), prefix: PENDING_PREFIX })) return { error: 'A photo is required.' }

  let meta: { contentType?: string; size: number }
  try {
    meta = await head(url, { token })
  } catch {
    return { error: 'A photo is required.' }
  }
  if (!meta.contentType?.startsWith('image/')) return { error: 'A photo is required.' }

  const { prefix, filename } = blobPathParts(url)
  const payload = await getPayloadClient()
  try {
    await payload.create({
      collection: 'event-photos',
      data: {
        filename,
        prefix,
        mimeType: meta.contentType,
        filesize: meta.size,
        focalX: 50,
        focalY: 50,
        event: eventId,
        status: 'pending',
        caption,
        submitterName,
      },
      overrideAccess: true,
      depth: 0,
    })
  } catch (err) {
    // `filename` is unique per collection: the same uploaded URL submitted twice.
    if (err instanceof ValidationError && err.data.errors.some((e) => e.path === 'filename')) {
      return { error: 'This photo has already been sent in. Thanks!' }
    }
    throw err
  }
}
