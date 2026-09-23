'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/db'
import { stories } from '@/db/schema'
import { makeUniqueSlug } from '@/lib/slugify'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'

async function slugIsTaken(slug: string): Promise<boolean> {
  const rows = await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug))
  return rows.length > 0
}

export async function submitStory(formData: FormData) {
  // Honeypot: real visitors never see or fill this hidden field. A bot that
  // fills every field does — pretend success without writing anything, so
  // as not to tip it off.
  if (String(formData.get('website') ?? '').trim() !== '') {
    redirect('/history/submit?submitted=1')
  }

  const title = String(formData.get('title') ?? '').trim()
  const authorName = String(formData.get('authorName') ?? '').trim()
  const rawContent = formData.get('contentJson')
  if (!title || !authorName || !rawContent) {
    throw new Error('Name, title and story body are required.')
  }

  const contentJson = JSON.parse(String(rawContent)) as JSONContent
  const contentHtml = renderStoryHtml(contentJson)
  const excerpt = htmlToExcerpt(contentHtml)
  if (!excerpt) {
    throw new Error('Story body cannot be empty.')
  }

  const slug = await makeUniqueSlug(title, slugIsTaken)

  await db.insert(stories).values({
    slug,
    title,
    excerpt,
    contentJson,
    contentHtml,
    coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
    authorName,
    authorEmail: String(formData.get('authorEmail') ?? '').trim(),
    submittedByAdmin: false,
    status: 'pending',
  })

  redirect('/history/submit?submitted=1')
}
