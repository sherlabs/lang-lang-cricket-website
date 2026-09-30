'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { events, eventRsvps, eventPhotos, type Event } from '@/db/schema'
import { isBlobUrl } from '@/lib/blob-url'
import { isValidPaymentUrl, normaliseMealOptions } from '@/lib/events-meal'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

export type EventInput = {
  type: 'one_time' | 'recurring'
  title: string
  description: string
  location: string
  coverImageUrl: string
  paymentLinkLabel: string
  paymentLinkUrl: string
  /** Dinner options, one per line (blank = no dinner step). Normalised server-side. */
  mealOptionsText: string
  eventTime: string
  eventDateStr: string
  dayOfWeek: number | null
  startDateStr: string
  endDateStr: string
}

/** "YYYY-MM-DD" -> UTC midnight Date, or null for an empty string. */
function parseDateStr(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

function revalidate() {
  revalidatePath('/events')
  revalidatePath('/admin/events')
}

function buildValues(input: EventInput) {
  const title = input.title.trim()
  if (!title) throw new Error('Title is required.')

  const coverImageUrl = input.coverImageUrl && isBlobUrl(input.coverImageUrl) ? input.coverImageUrl : ''

  const paymentLinkUrl = input.paymentLinkUrl.trim()
  if (!isValidPaymentUrl(paymentLinkUrl)) throw new Error('Payment link must be a full http(s) URL.')

  const base = {
    type: input.type,
    title,
    description: input.description.trim(),
    location: input.location.trim(),
    coverImageUrl,
    paymentLinkLabel: input.paymentLinkLabel.trim(),
    paymentLinkUrl,
    mealOptions: normaliseMealOptions(input.mealOptionsText ?? ''),
    eventTime: input.eventTime.trim(),
  }

  if (input.type === 'one_time') {
    const eventDate = parseDateStr(input.eventDateStr)
    if (!eventDate) throw new Error('Date is required.')
    return { ...base, eventDate, dayOfWeek: null, startDate: null, endDate: null }
  }

  const startDate = parseDateStr(input.startDateStr)
  const endDate = parseDateStr(input.endDateStr)
  if (!startDate || !endDate) throw new Error('Start and end dates are required.')
  if (input.dayOfWeek == null) throw new Error('Day of the week is required.')
  return { ...base, eventDate: null, dayOfWeek: input.dayOfWeek, startDate, endDate }
}

export type EventWithRsvpCount = Event & { rsvpCount: number; pendingPhotoCount: number }

export async function listEvents(): Promise<EventWithRsvpCount[]> {
  await requireAdmin()
  const [eventRows, rsvpCounts, pendingPhotoCounts] = await Promise.all([
    db.select().from(events).orderBy(events.createdAt) as unknown as Promise<Event[]>,
    db.select({ eventId: eventRsvps.eventId, count: sql<number>`count(*)` }).from(eventRsvps).groupBy(eventRsvps.eventId) as unknown as Promise<
      { eventId: number; count: number }[]
    >,
    db
      .select({ eventId: eventPhotos.eventId, count: sql<number>`count(*)` })
      .from(eventPhotos)
      .where(eq(eventPhotos.status, 'pending'))
      .groupBy(eventPhotos.eventId) as unknown as Promise<{ eventId: number; count: number }[]>,
  ])
  const rsvpCountByEventId = new Map(rsvpCounts.map((c) => [c.eventId, Number(c.count)]))
  const pendingPhotoCountByEventId = new Map(pendingPhotoCounts.map((c) => [c.eventId, Number(c.count)]))
  return eventRows.map((e) => ({
    ...e,
    rsvpCount: rsvpCountByEventId.get(e.id) ?? 0,
    pendingPhotoCount: pendingPhotoCountByEventId.get(e.id) ?? 0,
  }))
}

export async function getAdminEventById(id: number): Promise<Event | null> {
  await requireAdmin()
  const rows = await db.select().from(events).where(eq(events.id, id))
  return (rows[0] as Event | undefined) ?? null
}

export async function createEvent(input: EventInput) {
  await requireAdmin()
  const values = buildValues(input)
  await db.insert(events).values(values)
  revalidate()
}

export async function updateEvent(id: number, input: EventInput) {
  await requireAdmin()
  const values = buildValues(input)
  await db.update(events).set(values).where(eq(events.id, id))
  revalidate()
}

export async function deleteEvent(id: number) {
  await requireAdmin()
  await db.delete(events).where(eq(events.id, id))
  revalidate()
}
