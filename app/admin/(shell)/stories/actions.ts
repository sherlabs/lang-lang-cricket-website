'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/db'
import { stories, type Story } from '@/db/schema'
import { makeUniqueSlug } from '@/lib/slugify'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'
import { isBlobUrl } from '@/lib/blob-url'
import { generateStoryToken } from '@/lib/story-tokens'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

async function requireAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    throw new Error('Unauthorized')
  }
}

async function slugIsTaken(slug: string): Promise<boolean> {
  const rows = await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug))
  return rows.length > 0
}

function parseContentJson(raw: FormDataEntryValue | null): JSONContent {
  if (!raw) throw new Error('Story body is required.')
  return JSON.parse(String(raw)) as JSONContent
}

function safeCoverImageUrl(formData: FormData): string {
  const coverImageUrl = String(formData.get('coverImageUrl') ?? '')
  return coverImageUrl && isBlobUrl(coverImageUrl) ? coverImageUrl : ''
}

export async function listStories(): Promise<Story[]> {
  await requireAdmin()
  return db.select().from(stories).orderBy(stories.createdAt) as unknown as Promise<Story[]>
}

export async function getStoryById(id: number): Promise<Story | null> {
  await requireAdmin()
  const rows = await db.select().from(stories).where(eq(stories.id, id))
  return (rows[0] as Story | undefined) ?? null
}

export async function createStory(formData: FormData) {
  await requireAdmin()
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')
  const contentJson = parseContentJson(formData.get('contentJson'))
  const contentHtml = renderStoryHtml(contentJson)
  if (!htmlToExcerpt(contentHtml)) {
    throw new Error('Story body cannot be empty.')
  }
  const excerptInput = String(formData.get('excerpt') ?? '').trim()
  const slug = await makeUniqueSlug(title, slugIsTaken)

  await db.insert(stories).values({
    slug,
    title,
    excerpt: excerptInput || htmlToExcerpt(contentHtml),
    contentJson,
    contentHtml,
    coverImageUrl: safeCoverImageUrl(formData),
    authorName: String(formData.get('authorName') ?? '').trim() || 'Lang Lang Cricket Club',
    authorEmail: '',
    submittedByAdmin: true,
    status: 'published',
    publishedAt: new Date(),
    editToken: generateStoryToken(),
    viewToken: generateStoryToken(),
  })

  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

export async function updateStory(id: number, formData: FormData) {
  await requireAdmin()
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')
  const contentJson = parseContentJson(formData.get('contentJson'))
  const contentHtml = renderStoryHtml(contentJson)
  if (!htmlToExcerpt(contentHtml)) {
    throw new Error('Story body cannot be empty.')
  }
  const excerptInput = String(formData.get('excerpt') ?? '').trim()

  await db
    .update(stories)
    .set({
      title,
      excerpt: excerptInput || htmlToExcerpt(contentHtml),
      contentJson,
      contentHtml,
      coverImageUrl: safeCoverImageUrl(formData),
      authorName: String(formData.get('authorName') ?? '').trim() || 'Lang Lang Cricket Club',
    })
    .where(eq(stories.id, id))

  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

export async function approveStory(id: number) {
  await requireAdmin()
  await db
    .update(stories)
    .set({ status: 'published', publishedAt: new Date(), reviewedAt: new Date() })
    .where(eq(stories.id, id))
  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

/** Also used to unpublish an already-published story (spec: same status, one fewer state to manage). */
export async function rejectStory(id: number) {
  await requireAdmin()
  await db.update(stories).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(stories.id, id))
  revalidatePath('/admin/stories')
  revalidatePath('/history')
}
