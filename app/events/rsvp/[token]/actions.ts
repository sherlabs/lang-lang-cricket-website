'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { eventRsvps, type EventRsvp } from '@/db/schema'

export async function getRsvpByToken(token: string): Promise<EventRsvp | null> {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  return (rows[0] as EventRsvp | undefined) ?? null
}

export async function updateRsvpByToken(token: string, formData: FormData): Promise<{ error: string } | void> {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  const rsvp = (rows[0] as EventRsvp | undefined) ?? null
  if (!rsvp) return { error: 'This RSVP link is no longer valid.' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required.' }

  await db
    .update(eventRsvps)
    .set({
      name,
      email: String(formData.get('email') ?? '').trim(),
      note: String(formData.get('note') ?? '').trim(),
    })
    .where(eq(eventRsvps.editToken, token))

  revalidatePath('/admin/events')
}

export async function cancelRsvpByToken(token: string): Promise<{ error: string } | void> {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.editToken, token))
  const rsvp = (rows[0] as EventRsvp | undefined) ?? null
  if (!rsvp) return { error: 'This RSVP link is no longer valid.' }

  await db.delete(eventRsvps).where(eq(eventRsvps.editToken, token))
  // No revalidatePath here: the admin events pages are already force-dynamic, and revalidating
  // from a server action re-renders the current route (this RSVP's page) into the action response —
  // with the row gone that render hits notFound(), which would replace the "cancelled" card with a 404.
}
