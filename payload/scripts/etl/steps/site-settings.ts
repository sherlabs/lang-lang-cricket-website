import { normaliseTiers } from '../../../../lib/site-settings-core'
import { ETL_CONTEXT } from '../media'
import type { EtlStep } from './types'

/** Step 1: `site-settings` ← `site_settings.sponsorCarouselTiers`. Other keys are reported. */
export const siteSettingsStep: EtlStep = {
  name: 'site-settings',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('site-settings')
    const rows = await source.rows<{ key: string; value: unknown }>('site_settings', 'key')
    counts.read = rows.length
    for (const r of rows) {
      if (r.key !== 'sponsorCarouselTiers') {
        report.add({ step: 'site-settings', table: 'site_settings', id: r.key, kind: 'unmapped-key', detail: 'no Payload field; not imported' })
      }
    }
    const row = rows.find((r) => r.key === 'sponsorCarouselTiers')
    if (!row) return
    const tiers = normaliseTiers(row.value)
    if (tiers === null) {
      report.add({ step: 'site-settings', table: 'site_settings', id: row.key, kind: 'invalid-value', detail: `not a list: ${JSON.stringify(row.value)}; default kept` })
      return
    }
    const raw = Array.isArray(row.value) ? row.value : []
    const dropped = raw.filter((v) => !tiers.includes(v as string))
    if (dropped.length) {
      report.add({ step: 'site-settings', table: 'site_settings', id: row.key, kind: 'coerced', detail: `dropped ${JSON.stringify(dropped)}; stored ${JSON.stringify(tiers)} (readers normalise the same way)` })
    }
    if (dryRun) {
      counts.planned++
      return
    }
    const current = await payload.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true })
    if (current?.updatedAt && !update) {
      counts.skipped++
      return
    }
    await payload.updateGlobal({ slug: 'site-settings', data: { sponsorCarouselTiers: tiers as never }, overrideAccess: true, context: { ...ETL_CONTEXT } })
    counts[current?.updatedAt ? 'updated' : 'created']++
  },
}
