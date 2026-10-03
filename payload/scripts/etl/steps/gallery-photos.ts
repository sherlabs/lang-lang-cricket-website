import { importFile } from '../media'
import { bumpSequence, existingById, restoreTimestamps } from '../rows'
import type { EtlStep } from './types'

type Row = { id: number; url: string; caption: string; sort_order: number; created_at: Date }

/** Step 4: `gallery-photos` (id, sortOrder and caption kept), file per §12.4 under `gallery/`. */
export const galleryPhotosStep: EtlStep = {
  name: 'gallery-photos',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('gallery-photos')
    const rows = await source.rows<Row>('gallery_photos')
    counts.read = rows.length
    for (const r of rows) {
      const data = { caption: r.caption ?? '', sortOrder: r.sort_order ?? 0 }
      const where = { step: 'gallery-photos', table: 'gallery_photos', id: r.id, field: 'url' }
      if (dryRun) {
        await importFile(ctx, { collection: 'gallery-photos', url: r.url, data, relation: false, where })
        counts.planned++
        continue
      }
      const existing = await existingById(payload, 'gallery-photos', r.id)
      if (existing) {
        if (!update) {
          counts.skipped++
          continue
        }
        await payload.update({ collection: 'gallery-photos', id: r.id, data, overrideAccess: true, depth: 0, context: { etl: true, disableRevalidate: true } })
        await restoreTimestamps(payload, 'gallery-photos', r.id, r.created_at)
        counts.updated++
        continue
      }
      const res = await importFile(ctx, { collection: 'gallery-photos', url: r.url, data: { ...data, id: r.id }, relation: false, where })
      if (res.id) {
        await restoreTimestamps(payload, 'gallery-photos', res.id, r.created_at)
        counts.created++
      }
    }
    if (!dryRun) await bumpSequence(payload, 'gallery-photos', await source.sequenceLastValue('gallery_photos'))
  },
}
