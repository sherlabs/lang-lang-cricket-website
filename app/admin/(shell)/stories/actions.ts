'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/db'
import { stories, type Story } from '@/db/schema'
import { makeUniqueSlug } from '@/lib/slugify'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'

async function slugIsTaken(slug: string): Promise<boolean> {
  const rows = await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug))
  return rows.length > 0
}

function parseContentJson(raw: FormDataEntryValue | null): JSONContent {
  if (!raw) throw new Error('Story body is required.')
  return JSON.parse(String(raw)) as JSONContent
}

export async function listStories(): Promise<Story[]> {
  return db.select().from(stories).orderBy(stories.createdAt) as unknown as Promise<Story[]>
}

export async function getStoryById(id: number): Promise<Story | null> {
  const rows = await db.select().from(stories).where(eq(stories.id, id))
  return (rows[0] as Story | undefined) ?? null
}

export async function createStory(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')
  const contentJson = parseContentJson(formData.get('contentJson'))
  const contentHtml = renderStoryHtml(contentJson)
  const excerptInput = String(formData.get('excerpt') ?? '').trim()
  const slug = await makeUniqueSlug(title, slugIsTaken)

  await db.insert(stories).values({
    slug,
    title,
    excerpt: excerptInput || htmlToExcerpt(contentHtml),
    contentJson,
    contentHtml,
    coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
    authorName: String(formData.get('authorName') ?? '').trim() || 'Lang Lang Cricket Club',
    authorEmail: '',
    submittedByAdmin: true,
    status: 'published',
    publishedAt: new Date(),
  })

  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

export async function updateStory(id: number, formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')
  const contentJson = parseContentJson(formData.get('contentJson'))
  const contentHtml = renderStoryHtml(contentJson)
  const excerptInput = String(formData.get('excerpt') ?? '').trim()

  await db
    .update(stories)
    .set({
      title,
      excerpt: excerptInput || htmlToExcerpt(contentHtml),
      contentJson,
      contentHtml,
      coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
      authorName: String(formData.get('authorName') ?? '').trim() || 'Lang Lang Cricket Club',
    })
    .where(eq(stories.id, id))

  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

export async function approveStory(id: number) {
  await db
    .update(stories)
    .set({ status: 'published', publishedAt: new Date(), reviewedAt: new Date() })
    .where(eq(stories.id, id))
  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

/** Also used to unpublish an already-published story (spec: same status, one fewer state to manage). */
export async function rejectStory(id: number) {
  await db.update(stories).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(stories.id, id))
  revalidatePath('/admin/stories')
  revalidatePath('/history')
}
