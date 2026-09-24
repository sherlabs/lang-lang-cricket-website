'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { eventRsvps, type EventRsvp } from '@/db/schema'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

export async function listRsvpsForEvent(eventId: number): Promise<EventRsvp[]> {
  await requireAdmin()
  return db
    .select()
    .from(eventRsvps)
    .where(eq(eventRsvps.eventId, eventId))
    .orderBy(asc(eventRsvps.occurrenceDate)) as unknown as Promise<EventRsvp[]>
}

export async function deleteRsvp(id: number) {
  await requireAdmin()
  await db.delete(eventRsvps).where(eq(eventRsvps.id, id))
  revalidatePath('/admin/events')
}
