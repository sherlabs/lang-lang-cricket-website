'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { del } from '@vercel/blob'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { eventPhotos, type EventPhoto } from '@/db/schema'
import { isBlobUrl } from '@/lib/blob-url'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

function revalidate() {
  revalidatePath('/events')
  revalidatePath('/admin/events')
}

export async function listEventPhotos(eventId: number): Promise<EventPhoto[]> {
  await requireAdmin()
  return db
    .select()
    .from(eventPhotos)
    .where(eq(eventPhotos.eventId, eventId))
    .orderBy(asc(eventPhotos.sortOrder)) as unknown as Promise<EventPhoto[]>
}

/** Register already-uploaded Blob URLs against an event. New photos go to the front. */
export async function addEventPhotos(eventId: number, urls: string[]) {
  await requireAdmin()
  const clean = urls.filter((u) => typeof u === 'string' && isBlobUrl(u))
  if (clean.length === 0) return
  await db
    .update(eventPhotos)
    .set({ sortOrder: sql`${eventPhotos.sortOrder} + ${clean.length}` })
    .where(eq(eventPhotos.eventId, eventId))
  await db.insert(eventPhotos).values(clean.map((url, i) => ({ eventId, url, sortOrder: i })))
  revalidate()
}

export async function removeEventPhoto(id: number) {
  await requireAdmin()
  await db.delete(eventPhotos).where(eq(eventPhotos.id, id))
  revalidate()
}

/** Publicly submitted photos awaiting admin review for an event (see app/events/[id]/actions.ts's submitEventPhoto). */
export async function listPendingEventPhotos(eventId: number): Promise<EventPhoto[]> {
  await requireAdmin()
  return db
    .select()
    .from(eventPhotos)
    .where(and(eq(eventPhotos.eventId, eventId), eq(eventPhotos.status, 'pending')))
    .orderBy(asc(eventPhotos.createdAt)) as unknown as Promise<EventPhoto[]>
}

/** Makes a pending public submission publicly visible. */
export async function approveEventPhoto(id: number) {
  await requireAdmin()
  await db.update(eventPhotos).set({ status: 'approved' }).where(eq(eventPhotos.id, id))
  revalidate()
}

/**
 * Rejects (deletes) a pending public submission, including its underlying
 * Blob file so storage doesn't fill with orphans — UNLESS another
 * `eventPhotos` row (e.g. an already-approved photo) still references the
 * same URL. That can happen because an approved photo's URL stays a valid,
 * fetchable Blob URL under events/pending/ forever, so anyone can copy it
 * and resubmit it via submitEventPhoto; rejecting that duplicate must not
 * delete the file out from under the still-approved original.
 */
export async function rejectEventPhoto(id: number) {
  await requireAdmin()
  const [row] = await db.select().from(eventPhotos).where(eq(eventPhotos.id, id))
  if (!row) return
  const sameUrlRows = await db.select().from(eventPhotos).where(eq(eventPhotos.url, row.url))
  const stillReferencedElsewhere = sameUrlRows.some((r) => r.id !== id)
  await db.delete(eventPhotos).where(eq(eventPhotos.id, id))
  if (isBlobUrl(row.url) && !stillReferencedElsewhere) await del(row.url).catch(() => {})
  revalidate()
}
