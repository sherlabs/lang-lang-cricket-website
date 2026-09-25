'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { announcements, type Announcement } from '@/db/schema'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

export type AnnouncementInput = { title: string; body: string; published: boolean }

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

function revalidate() {
  revalidatePath('/')
  revalidatePath('/announcements')
  revalidatePath('/admin/announcements')
}

function clean(input: AnnouncementInput): AnnouncementInput {
  return {
    title: String(input.title ?? '').trim(),
    body: String(input.body ?? '').trim(),
    published: Boolean(input.published),
  }
}

export async function listAnnouncements(): Promise<Announcement[]> {
  await requireAdmin()
  return db.select().from(announcements).orderBy(desc(announcements.createdAt))
}

export async function createAnnouncement(input: AnnouncementInput): Promise<void> {
  await requireAdmin()
  const data = clean(input)
  if (!data.title) throw new Error('Title is required.')
  await db.insert(announcements).values(data)
  revalidate()
}

export async function updateAnnouncement(id: number, input: AnnouncementInput): Promise<void> {
  await requireAdmin()
  const data = clean(input)
  if (!data.title) throw new Error('Title is required.')
  await db
    .update(announcements)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(announcements.id, id))
  revalidate()
}

export async function deleteAnnouncement(id: number): Promise<void> {
  await requireAdmin()
  await db.delete(announcements).where(eq(announcements.id, id))
  revalidate()
}
