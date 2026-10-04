import { DOCUMENT_CATEGORIES, type DocumentCategory } from '../../../../lib/documents'
import { ETL_CONTEXT, fileConflict, importFile } from '../media'
import { bumpSequence, existingById, restoreTimestamps } from '../rows'
import type { EtlStep } from './types'

type Row = { id: number; category: string; title: string; url: string; created_at: Date }

/** Step 3: `documents` (id kept), file per §12.4 (registered under `documents/`, or uploaded). */
export const documentsStep: EtlStep = {
  name: 'documents',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('documents')
    const rows = await source.rows<Row>('documents')
    counts.read = rows.length
    for (const r of rows) {
      let category = r.category as DocumentCategory
      if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
        report.add({ step: 'documents', table: 'documents', id: r.id, field: 'category', kind: 'coerced', detail: `unknown category "${category}" → "Policies"` })
        category = 'Policies'
      }
      const data = { title: r.title, category }
      const docWhere = { step: 'documents', table: 'documents', id: r.id, field: 'url' }
      if (dryRun) {
        await importFile(ctx, { collection: 'documents', url: r.url, data, relation: false, where: docWhere })
        counts.planned++
        continue
      }
      const existing = await existingById(payload, 'documents', r.id)
      if (existing) {
        if (!update) {
          counts.skipped++
          continue
        }
        // --update: data only; a legacy row's file is never replaced. The kept file must be this legacy row's: after a rollback a reused id can hold a
        // Payload-native row of the failed window (§13.4); if not, the row is replaced.
        const conflict = await fileConflict(ctx, 'documents', existing, r.url)
        if (!conflict) {
          await payload.update({ collection: 'documents', id: r.id, data, overrideAccess: true, depth: 0, context: { etl: true, disableRevalidate: true } })
          await restoreTimestamps(payload, 'documents', r.id, r.created_at)
          counts.updated++
          continue
        }
        report.add({ ...docWhere, kind: 'file-conflict-replaced', detail: `${conflict}; row deleted and re-imported` })
        await payload.delete({ collection: 'documents', id: r.id, overrideAccess: true, context: { ...ETL_CONTEXT } })
        counts.deleted++
      }
      const res = await importFile(ctx, { collection: 'documents', url: r.url, data: { ...data, id: r.id }, relation: false, where: docWhere })
      if (res.id) {
        await restoreTimestamps(payload, 'documents', res.id, r.created_at)
        counts.created++
      }
    }
    if (!dryRun) await bumpSequence(payload, 'documents', await source.sequenceLastValue('documents'))
  },
}
