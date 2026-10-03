import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { clubDefaults } from '../../../seed/club-defaults'
import { seedClubGlobal } from '../../../seed/seed-club-global'
import { ETL_CONTEXT, type EtlContext } from '../media'
import type { EtlStep } from './types'

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

/**
 * Upload a file from public/ into `media` once (deduped on legacyUrl = its site path), under
 * `name` rather than its basename: media filenames are unique per collection, and a generic
 * `logo.png` would push own-store blobs with the same basename (sponsors/logo.png, …) off the
 * registration path.
 */
async function uploadPublicFile(ctx: EtlContext, sitePath: string, name: string, alt: string): Promise<number | null> {
  const { payload, report } = ctx
  const existing = await payload.find({ collection: 'media', where: { legacyUrl: { equals: sitePath } }, limit: 1, depth: 0, overrideAccess: true })
  if (existing.docs[0]) return existing.docs[0].id
  const filePath = path.join(ctx.publicDir, sitePath)
  if (!existsSync(filePath)) {
    report.add({ step: 'club', table: 'club', id: 'global', url: sitePath, kind: 'media-missing', detail: `public${sitePath} does not exist` })
    return null
  }
  report.mediaAction('upload-local-asset')
  const data = readFileSync(filePath)
  const mimetype = MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const doc = await payload.create({
    collection: 'media',
    data: { alt, legacyUrl: sitePath },
    file: { data, mimetype, name, size: data.length },
    overrideAccess: true,
    depth: 0,
    context: { ...ETL_CONTEXT },
  })
  return doc.id
}

/**
 * Step 2: the `club` global, seeded from the defaults unless it already exists (never
 * force-seeded, so an `--update` re-run after cutover keeps admin edits). Then, whatever the
 * seed did, the branding files (logo, OG image) are uploaded from public/ into `media` and set
 * on the global, but only where those fields are still empty. The home hero is defaults-module
 * only in v1 (no global field), so it stays static.
 */
export const clubStep: EtlStep = {
  name: 'club',
  async run(ctx) {
    const { payload, report, dryRun } = ctx
    const counts = report.counts('club')
    counts.read = 1
    if (dryRun) {
      // Plan the branding uploads the real run would make, so the dry run's media counts match.
      counts.planned++
      const current = await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })
      const plan = (sitePath: string, name: string) => {
        if (report.claimed.urls.has(`media ${sitePath}`)) return
        if (!existsSync(path.join(ctx.publicDir, sitePath))) {
          report.add({ step: 'club', table: 'club', id: 'global', url: sitePath, kind: 'media-missing', detail: `public${sitePath} does not exist` })
          return
        }
        report.mediaAction('upload-local-asset')
        report.claimed.urls.add(`media ${sitePath}`)
        report.claimed.filenames.add(`media ${name}`)
      }
      const ext = (p: string) => path.extname(p).toLowerCase()
      if (!current.logo) plan(clubDefaults.assets.logo, `club-logo${ext(clubDefaults.assets.logo)}`)
      if (!current.ogImage) plan(clubDefaults.assets.ogImage.url, `club-og-image${ext(clubDefaults.assets.ogImage.url)}`)
      return
    }
    let result = await seedClubGlobal(payload)

    const current = await payload.findGlobal({ slug: 'club', depth: 0, overrideAccess: true })
    const ext = (p: string) => path.extname(p).toLowerCase()
    const logo = current.logo
      ? null
      : await uploadPublicFile(ctx, clubDefaults.assets.logo, `club-logo${ext(clubDefaults.assets.logo)}`, `${clubDefaults.name} crest`)
    const ogImage = current.ogImage
      ? null
      : await uploadPublicFile(ctx, clubDefaults.assets.ogImage.url, `club-og-image${ext(clubDefaults.assets.ogImage.url)}`, clubDefaults.ogImageAlt)
    if (logo || ogImage) {
      await payload.updateGlobal({
        slug: 'club',
        data: { ...(logo ? { logo } : {}), ...(ogImage ? { ogImage } : {}) },
        overrideAccess: true,
        context: { ...ETL_CONTEXT },
      })
      if (result === 'skipped') result = 'updated'
    }
    counts[result]++
  },
}
