import { htmlToLexical, imageAlts, normaliseStoryHtml, resolveUploadNodes } from '../../../../lib/stories-convert'
import { renderStoryHtml } from '../../../../lib/stories-content'
import { ETL_CONTEXT, importFile } from '../media'
import { bumpSequence, existingById, restoreTimestamps } from '../rows'
import { STORY_STATUSES } from '../rules'
import type { EtlStep } from './types'

export type LegacyStoryRow = {
  id: number
  slug: string
  title: string
  excerpt: string | null
  content_json: unknown
  content_html: string | null
  cover_image_url: string | null
  author_name: string
  author_email: string | null
  submitted_by_admin: boolean | null
  status: string
  edit_token: string
  view_token: string
  created_at: Date
  published_at: Date | null
  reviewed_at: Date | null
}

export { STORY_STATUSES } from '../rules'

const iso = (d: Date | null) => (d instanceof Date ? d.toISOString() : null)

/** Legacy HTML of a row: `content_html`, falling back to rendering `content_json` through the Tiptap schema. */
export function legacyHtml(r: Pick<LegacyStoryRow, 'content_html' | 'content_json'>): string {
  if (typeof r.content_html === 'string' && r.content_html.trim()) return r.content_html
  try {
    const json = typeof r.content_json === 'string' ? JSON.parse(r.content_json) : r.content_json
    return json ? renderStoryHtml(json as Parameters<typeof renderStoryHtml>[0]) : ''
  } catch {
    return ''
  }
}

/**
 * Step 11: `stories` (id kept; spec §12.2). Slug, status, both tokens, `authorEmail`,
 * `submittedByAdmin`, `publishedAt`/`reviewedAt` and `excerpt` (verbatim, even '') are kept —
 * every story hook is skipped under `context.etl`. Content: `content_html` (fallback:
 * `renderStoryHtml(content_json)`) → `normaliseStoryHtml` → `htmlToLexical` →
 * `resolveUploadNodes` in ETL mode: own-store blobs (any prefix) are registered as media,
 * `/assets/` images uploaded from `public/`, and anything else is dropped and reported. Links
 * whose href is not http(s)/mailto are unwrapped (text kept) and reported as `story-link-unwrapped`.
 * `coverImageUrl` → media.
 *
 * Timestamps: `created_at` is restored. Legacy stories have no `updated_at`; it is set to
 * `COALESCE(reviewed_at, published_at, created_at)` — what the legacy app used for the sitemap
 * `lastmod` and JSON-LD `dateModified`, both of which now read `updatedAt` (WP4 findings).
 */
export const storiesStep: EtlStep = {
  name: 'stories',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('stories')
    const rows = await source.rows<LegacyStoryRow>('stories')
    counts.read = rows.length
    for (const r of rows) {
      const where = { step: 'stories', table: 'stories', id: r.id }
      if (!STORY_STATUSES.has(r.status)) {
        report.add({ ...where, field: 'status', kind: 'skipped', detail: `unknown status "${r.status}"` })
        counts.skipped++
        continue
      }
      const existing = dryRun ? null : await existingById(payload, 'stories', r.id)
      if (existing && !update) {
        counts.skipped++
        continue
      }

      const { html, droppedImages, unwrappedLinks } = normaliseStoryHtml(legacyHtml(r), { storeId: ctx.storeId })
      for (const src of droppedImages) {
        report.add({ ...where, field: 'content_html', url: src, kind: 'story-image-dropped', detail: 'not an own-store Blob URL or /assets/ path; image removed from the body' })
      }
      for (const href of unwrappedLinks) {
        report.add({ ...where, field: 'content_html', url: href, kind: 'story-link-unwrapped', detail: 'href is not http(s)/mailto (relative, tel:, missing…); link removed, text kept' })
      }

      if (dryRun) {
        for (const src of imageAlts(html).keys()) {
          await importFile(ctx, { collection: 'media', url: src, relation: true, where: { ...where, field: 'content_html' } })
        }
        await importFile(ctx, { collection: 'media', url: r.cover_image_url, relation: true, where: { ...where, field: 'cover_image_url' } })
        counts.planned++
        continue
      }

      const content = await htmlToLexical(html, payload.config)
      await resolveUploadNodes(content, {
        payload,
        mode: 'etl',
        alts: imageAlts(html),
        register: async (src, alt) =>
          (await importFile(ctx, { collection: 'media', url: src, data: { alt }, relation: true, where: { ...where, field: 'content_html' } })).id,
        onDrop: (src) => report.add({ ...where, field: 'content_html', url: src, kind: 'story-image-dropped', detail: 'could not be registered or uploaded; image removed from the body' }),
      })
      const cover = await importFile(ctx, { collection: 'media', url: r.cover_image_url, data: { alt: '' }, relation: true, where: { ...where, field: 'cover_image_url' } })

      const data = {
        slug: r.slug,
        title: r.title,
        excerpt: r.excerpt ?? '',
        content,
        coverImage: cover.id,
        authorName: r.author_name,
        authorEmail: r.author_email ?? '',
        submittedByAdmin: Boolean(r.submitted_by_admin),
        status: r.status as 'pending' | 'published' | 'rejected',
        editToken: r.edit_token,
        viewToken: r.view_token,
        publishedAt: iso(r.published_at),
        reviewedAt: iso(r.reviewed_at),
      }
      const updatedAt = r.reviewed_at ?? r.published_at ?? r.created_at
      try {
        if (existing) {
          await payload.update({ collection: 'stories', id: r.id, data, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
          counts.updated++
        } else {
          await payload.create({ collection: 'stories', data: { ...data, id: r.id } as never, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
          counts.created++
        }
      } catch (err) {
        report.add({ ...where, kind: 'error', detail: (err as Error).message })
        counts.skipped++
        continue
      }
      await restoreTimestamps(payload, 'stories', r.id, r.created_at, updatedAt)
    }
    if (!dryRun) await bumpSequence(payload, 'stories', await source.sequenceLastValue('stories'))
  },
}
