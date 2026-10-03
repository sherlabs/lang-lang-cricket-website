import { existsSync } from 'node:fs'
import path from 'node:path'
import { clubDefaults } from '../../../seed/club-defaults'
import { seedClubGlobal } from '../../../seed/seed-club-global'
import { ETL_CONTEXT, type EtlContext } from '../media'
import type { EtlStep } from './types'

/** Upload a file from public/ into `media` once (deduped on legacyUrl = its site path). */
async function uploadPublicFile(ctx: EtlContext, sitePath: string, alt: string): Promise<number | null> {
  const { payload, report } = ctx
  const existing = await payload.find({ collection: 'media', where: { legacyUrl: { equals: sitePath } }, limit: 1, depth: 0, overrideAccess: true })
  if (existing.docs[0]) return existing.docs[0].id
  const filePath = path.join(ctx.publicDir, sitePath)
  if (!existsSync(filePath)) {
    report.add({ step: 'club', table: 'club', id: 'global', url: sitePath, kind: 'media-missing', detail: `public${sitePath} does not exist` })
    return null
  }
  report.mediaAction('upload-local-asset')
  const doc = await payload.create({ collection: 'media', data: { alt, legacyUrl: sitePath }, filePath, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
  return doc.id
}

/**
 * Step 2: the `club` global, seeded from the defaults unless it already exists; then the
 * branding files (logo, OG image) are uploaded from public/ into `media` and set on the
 * global. The home hero is defaults-module only in v1 (no global field), so it stays static.
 */
export const clubStep: EtlStep = {
  name: 'club',
  async run(ctx) {
    const { payload, report, dryRun } = ctx
    const counts = report.counts('club')
    counts.read = 1
    if (dryRun) {
      counts.planned++
      return
    }
    const result = await seedClubGlobal(payload, { force: ctx.update })
    counts[result]++
    if (result === 'skipped') return

    const logo = await uploadPublicFile(ctx, clubDefaults.assets.logo, `${clubDefaults.name} crest`)
    const ogImage = await uploadPublicFile(ctx, clubDefaults.assets.ogImage.url, clubDefaults.ogImageAlt)
    await payload.updateGlobal({
      slug: 'club',
      data: { ...(logo ? { logo } : {}), ...(ogImage ? { ogImage } : {}) },
      overrideAccess: true,
      context: { ...ETL_CONTEXT },
    })
  },
}
