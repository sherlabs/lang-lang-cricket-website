import { DEFAULT_TIER, TIER_ORDER } from '../../../../lib/sponsors'
import { importFile } from '../media'
import { bumpSequence, existingById, upsertRow } from '../rows'
import type { EtlStep } from './types'

type Row = { id: number; tier: string; name: string; logo_url: string; link_url: string; created_at: Date }

/**
 * Step 5: `sponsors` (id kept). `logo` becomes a media relation. `sortOrder` is the rank of
 * the legacy id within its tier — today's effective (insertion) order.
 */
export const sponsorsStep: EtlStep = {
  name: 'sponsors',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('sponsors')
    const rows = await source.rows<Row>('sponsors')
    counts.read = rows.length
    const rank = new Map<number, number>()
    const seen: Record<string, number> = {}
    for (const r of rows) {
      const tier = (TIER_ORDER as readonly string[]).includes(r.tier) ? r.tier : DEFAULT_TIER
      rank.set(r.id, (seen[tier] = (seen[tier] ?? -1) + 1))
    }
    for (const r of rows) {
      let tier = r.tier
      if (!(TIER_ORDER as readonly string[]).includes(tier)) {
        report.add({ step: 'sponsors', table: 'sponsors', id: r.id, field: 'tier', kind: 'coerced', detail: `unknown tier "${tier}" → "${DEFAULT_TIER}" (the legacy app showed it as ${DEFAULT_TIER} too)` })
        tier = DEFAULT_TIER
      }
      if (!dryRun && !update && (await existingById(payload, 'sponsors', r.id))) {
        counts.skipped++
        continue
      }
      const logo = await importFile(ctx, {
        collection: 'media',
        url: r.logo_url,
        data: { alt: '' },
        relation: true,
        where: { step: 'sponsors', table: 'sponsors', id: r.id, field: 'logo_url' },
      })
      await upsertRow(ctx, {
        step: 'sponsors',
        collection: 'sponsors',
        id: r.id,
        data: { name: r.name, tier, logo: logo.id, linkUrl: r.link_url ?? '', sortOrder: rank.get(r.id) ?? 0 },
        createdAt: r.created_at,
      })
    }
    if (!dryRun) await bumpSequence(payload, 'sponsors', await source.sequenceLastValue('sponsors'))
  },
}
