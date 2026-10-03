import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook } from 'payload'
import { mergeOver } from '../../lib/club-merge'
import { htmlToExcerpt } from '../../lib/story-excerpt'
import { clubDefaults } from '../seed/club-defaults'

/**
 * Story lifecycle hooks (spec §3.11, §5). Every hook here is skipped under `context.etl`, which
 * keeps the legacy values verbatim (slug, tokens, submittedByAdmin, publishedAt/reviewedAt,
 * excerpt — even `''`).
 */

/** Keys a public token edit may never change (spec §3.11, A7). */
export const PUBLIC_EDIT_PROTECTED = ['status', 'slug', 'editToken', 'viewToken', 'submittedByAdmin', 'publishedAt', 'reviewedAt'] as const

type Data = Record<string, unknown>

/** Plain excerpt of a Lexical story body: upload nodes render as nothing (they hold only an id here). */
export function excerptFromContent(content: unknown): string {
  if (!content || typeof content !== 'object' || !('root' in content)) return ''
  try {
    const html = convertLexicalToHTML({
      data: content as Parameters<typeof convertLexicalToHTML>[0]['data'],
      disableContainer: true,
      converters: ({ defaultConverters }) => ({ ...defaultConverters, upload: () => '' }),
    })
    return htmlToExcerpt(html)
  } catch {
    return ''
  }
}

/** beforeValidate: an admin-created story with no author is by the club (`club.name`). */
export const defaultAuthorName: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (!data || req.context?.etl || operation !== 'create') return data
  if (typeof data.authorName === 'string' && data.authorName.trim()) return data
  if (!req.user) return data
  let name = clubDefaults.name
  try {
    const club = await req.payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true, req })
    if ((club as { updatedAt?: unknown }).updatedAt) name = mergeOver(clubDefaults, club).name
  } catch {
    // defaults
  }
  return { ...data, authorName: name }
}

/**
 * beforeChange (collection; runs BEFORE the field beforeChange hooks, so the slug/token field
 * hooks still reset whatever this leaves):
 * 1. Public token edit (`context.publicSubmission`): strip the protected keys and force
 *    `pending` — a leaked edit link must never publish (spec §5 "Behaviour change"). A public
 *    create is forced to `pending` the same way.
 * 2. `submittedByAdmin`: computed on create (`Boolean(req.user) && !publicSubmission`), kept on update.
 * 3. Timestamps on status transitions: → published: `publishedAt ??= now`, and `reviewedAt = now`
 *    on an update (a review); → rejected: `reviewedAt = now`. Otherwise both keep the stored
 *    values, so nothing can backdate them (they also have create/update access `nobody`).
 *    An admin creating a story as published gets `publishedAt` only, as before (no review).
 * 4. Empty `excerpt` → derived from the body.
 */
export const storyLifecycle: CollectionBeforeChangeHook = ({ data, operation, originalDoc, req }) => {
  if (!data || req.context?.etl) return data
  const original = (originalDoc ?? {}) as Data
  const isPublic = req.context?.publicSubmission === true

  if (isPublic) {
    if (operation === 'update') for (const key of PUBLIC_EDIT_PROTECTED) delete data[key]
    data.status = 'pending'
  }

  data.submittedByAdmin = operation === 'create' ? Boolean(req.user) && !isPublic : Boolean(original.submittedByAdmin)

  const previous = operation === 'update' ? original.status : undefined
  const status = data.status ?? previous
  let publishedAt = operation === 'update' ? (original.publishedAt ?? null) : null
  let reviewedAt = operation === 'update' ? (original.reviewedAt ?? null) : null
  if (status !== previous) {
    const now = new Date().toISOString()
    if (status === 'published') {
      publishedAt ??= now
      if (operation === 'update') reviewedAt = now
    } else if (status === 'rejected') {
      reviewedAt = now
    }
  }
  data.publishedAt = publishedAt
  data.reviewedAt = reviewedAt

  const excerpt = data.excerpt !== undefined ? data.excerpt : original.excerpt
  if (typeof excerpt !== 'string' || !excerpt.trim()) {
    data.excerpt = excerptFromContent(data.content !== undefined ? data.content : original.content)
  }
  return data
}
