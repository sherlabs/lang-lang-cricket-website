import 'server-only'
import type { Payload, PayloadRequest } from 'payload'
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
import { isEmailOrEmpty } from '@/payload/fields/validators'
import { legacyBlobStoreId } from '@/payload/env'

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
async function resolveCover(payload: Payload, url: string, req?: Partial<PayloadRequest>): Promise<number | null> {
  if (!url) return null
  const existing = await findMediaBySrc(payload, url, req)
  if (existing) return existing
  return registerPendingStoryImage(payload, url, '', req)
}

/**
 * Runs a public story save in one transaction, so the `media` docs `parseStoryForm` registers
 * are rolled back when the save is refused (`{ error }`) or throws. Rolling back rather than
 * deleting the docs keeps the visitor's pending blob for a retry (deleting a media doc deletes
 * its blob, spec §7.5). Every Local API call inside must pass `req`.
 */
export async function inStoryTransaction<T extends object>(payload: Payload, fn: (req: Partial<PayloadRequest>) => Promise<T>): Promise<T> {
  const transactionID = (await payload.db?.beginTransaction?.()) ?? null
  const req: Partial<PayloadRequest> = transactionID !== null ? { transactionID } : {}
  let result: T
  try {
    result = await fn(req)
  } catch (err) {
    if (transactionID !== null) await payload.db.rollbackTransaction(transactionID)
    throw err
  }
  if (transactionID !== null) {
    if ('error' in result) await payload.db.rollbackTransaction(transactionID)
    else await payload.db.commitTransaction(transactionID)
  }
  return result
}

export async function parseStoryForm(
  payload: Payload,
  formData: FormData,
  req?: Partial<PayloadRequest>,
): Promise<{ data: StoryFormData } | { error: string }> {
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
  // Production: this store's Blob URLs only. A preview also accepts the production store's
  // (its legacy rows point there); resolveUploadNodes stays the gate either way.
  const storeId = legacyBlobStoreId()
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
      req,
      register: (src, alt) => registerPendingStoryImage(payload, src, alt, req),
    })
  } catch (err) {
    if (err instanceof StoryImageError) return { error: FOREIGN_IMAGE_ERROR }
    throw err
  }

  const coverImage = await resolveCover(payload, text(formData, 'coverImageUrl'), req)
  return { data: { title, authorName, authorEmail, excerpt, content, coverImage } }
}

/** A Payload validation failure as a form error (never a 500). */
export function validationMessage(err: unknown): string | null {
  if (!(err instanceof ValidationError)) return null
  const first = err.data?.errors?.[0]
  return first?.message ? `Please check the form: ${first.message}` : 'Please check the form and try again.'
}
