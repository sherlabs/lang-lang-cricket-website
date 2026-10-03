'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/db'
import { stories } from '@/db/schema'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'
import { isBlobUrl } from '@/lib/blob-url'
import { getStoryByEditToken } from '@/lib/stories-queries'

/** Anyone holding the edit token may update the story, regardless of its current status. */
export async function updateDraftByToken(editToken: string, formData: FormData): Promise<{ error: string } | void> {
  const story = await getStoryByEditToken(editToken)
  if (!story) {
    return { error: 'This edit link is no longer valid.' }
  }

  const title = String(formData.get('title') ?? '').trim()
  const authorName = String(formData.get('authorName') ?? '').trim()
  const rawContent = formData.get('contentJson')
  if (!title || !authorName || !rawContent) {
    return { error: 'Name, title and story body are required.' }
  }

  const contentJson = JSON.parse(String(rawContent)) as JSONContent
  const contentHtml = renderStoryHtml(contentJson)
  const excerpt = htmlToExcerpt(contentHtml)
  if (!excerpt) {
    return { error: 'Story body cannot be empty.' }
  }

  const coverImageUrl = String(formData.get('coverImageUrl') ?? '')
  const safeCoverImageUrl = coverImageUrl && isBlobUrl(coverImageUrl) ? coverImageUrl : ''

  await db
    .update(stories)
    .set({
      title,
      excerpt,
      contentJson,
      contentHtml,
      coverImageUrl: safeCoverImageUrl,
      authorName,
      authorEmail: String(formData.get('authorEmail') ?? '').trim(),
    })
    .where(eq(stories.editToken, editToken))

  revalidatePath('/admin/stories')
  revalidatePath('/history')
  if (story.status === 'published') revalidatePath(`/history/${story.slug}`)
}
