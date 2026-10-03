import 'server-only'
import type { Payload } from 'payload'
import { ValidationError } from 'payload'
import {
  FOREIGN_IMAGE_ERROR,
  StoryImageError,
  findMediaBySrc,
  htmlToLexical,
  imageAlts,
  normaliseStoryHtml,
  registerPendingStoryImage,
  resolveUploadNodes,
  tiptapJsonToSafeHtml,
  type StoryContent,
} from '@/lib/stories-convert'
import { htmlToExcerpt } from '@/lib/story-excerpt'
import { blobStoreId } from '@/lib/blob-url'
import { isEmailOrEmpty } from '@/payload/fields/validators'
import { blobToken } from '@/payload/env'

/**
 * The public story write pipeline shared by `submitStory` and `updateDraftByToken` (spec §5,
 * §6): allowlisted form keys only, Tiptap JSON through the ProseMirror schema, normalised onto
 * the Lexical feature set, images linked to existing media or registered from
 * `stories/pending/` — anything else is refused.
 */

const MAX_TITLE = 200
const MAX_AUTHOR = 200
const MAX_EMAIL = 200

export type StoryFormData = {
  title: string
  authorName: string
  authorEmail: string
  excerpt: string
  content: StoryContent
  coverImage: number | null
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

/** Cover: existing media first (a token edit keeps a legacy cover), else a pending upload. Anything else is ignored, as before. */
async function resolveCover(payload: Payload, url: string): Promise<number | null> {
  if (!url) return null
  const existing = await findMediaBySrc(payload, url)
  if (existing) return existing
  return registerPendingStoryImage(payload, url)
}

export async function parseStoryForm(payload: Payload, formData: FormData): Promise<{ data: StoryFormData } | { error: string }> {
  const title = text(formData, 'title')
  const authorName = text(formData, 'authorName')
  const authorEmail = text(formData, 'authorEmail')
  const rawContent = formData.get('contentJson')
  if (!title || !authorName || !rawContent) return { error: 'Name, title and story body are required.' }
  if (title.length > MAX_TITLE) return { error: `Keep the title to ${MAX_TITLE} characters or fewer.` }
  if (authorName.length > MAX_AUTHOR) return { error: `Keep your name to ${MAX_AUTHOR} characters or fewer.` }
  if (authorEmail.length > MAX_EMAIL || !isEmailOrEmpty(authorEmail)) return { error: 'Enter a valid email address, or leave it empty.' }

  const rendered = tiptapJsonToSafeHtml(String(rawContent))
  if ('error' in rendered) return rendered
  const storeId = blobStoreId(blobToken())
  const normalised = normaliseStoryHtml(rendered.html, { storeId })
  if (normalised.droppedImages.length) return { error: FOREIGN_IMAGE_ERROR }
  const excerpt = htmlToExcerpt(normalised.html)
  if (!excerpt) return { error: 'Story body cannot be empty.' }

  let content: StoryContent
  try {
    content = await htmlToLexical(normalised.html, payload.config)
    await resolveUploadNodes(content, {
      payload,
      mode: 'public',
      alts: imageAlts(normalised.html),
      register: (src, alt) => registerPendingStoryImage(payload, src, alt),
    })
  } catch (err) {
    if (err instanceof StoryImageError) return { error: FOREIGN_IMAGE_ERROR }
    throw err
  }

  const coverImage = await resolveCover(payload, text(formData, 'coverImageUrl'))
  return { data: { title, authorName, authorEmail, excerpt, content, coverImage } }
}

/** A Payload validation failure as a form error (never a 500). */
export function validationMessage(err: unknown): string | null {
  if (!(err instanceof ValidationError)) return null
  const first = err.data?.errors?.[0]
  return first?.message ? `Please check the form: ${first.message}` : 'Please check the form and try again.'
}
