import { importFile } from '../media'
import { bumpSequence, existingById, restoreTimestamps } from '../rows'
import type { EtlStep } from './types'

type Row = {
  id: number
  event_id: number
  url: string
  caption: string
  sort_order: number
  status: string
  submitter_name: string
  created_at: Date
}

/**
 * Step 10: `event-photos` (id kept), file per §12.4 under `events/` (pending submissions sit
 * under `events/pending/`, inside the collection prefix). Status and submitter are kept.
 * Orphans (no such legacy event) are skipped and reported. A status other than
 * approved/pending (the legacy app deleted rejects, so e.g. `rejected` is anomalous) is
 * skipped and reported rather than coerced: coercing to `pending` would resurface an
 * already-rejected photo in the review queue.
 */
export const eventPhotosStep: EtlStep = {
  name: 'event-photos',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('event-photos')
    const events = new Set((await source.rows<{ id: number }>('events')).map((e) => e.id))
    const rows = await source.rows<Row>('event_photos')
    counts.read = rows.length
    for (const r of rows) {
      const where = { step: 'event-photos', table: 'event_photos', id: r.id, field: 'url' }
      if (!events.has(r.event_id)) {
        report.add({ ...where, field: 'event_id', url: r.url, kind: 'orphan-skipped', detail: `event ${r.event_id} does not exist` })
        counts.skipped++
        continue
      }
      if (r.status !== 'approved' && r.status !== 'pending') {
        report.add({ ...where, field: 'status', url: r.url, kind: 'skipped', detail: `status "${r.status}" is not approved/pending` })
        counts.skipped++
        continue
      }
      const data = {
        event: r.event_id,
        caption: r.caption ?? '',
        sortOrder: r.sort_order ?? 0,
        status: r.status as 'approved' | 'pending',
        submitterName: r.submitter_name ?? '',
      }
      if (dryRun) {
        await importFile(ctx, { collection: 'event-photos', url: r.url, data, relation: false, where })
        counts.planned++
        continue
      }
      const existing = await existingById(payload, 'event-photos', r.id)
      if (existing) {
        if (!update) {
          counts.skipped++
          continue
        }
        await payload.update({ collection: 'event-photos', id: r.id, data, overrideAccess: true, depth: 0, context: { etl: true, disableRevalidate: true } })
        await restoreTimestamps(payload, 'event-photos', r.id, r.created_at)
        counts.updated++
        continue
      }
      const res = await importFile(ctx, { collection: 'event-photos', url: r.url, data: { ...data, id: r.id }, relation: false, where })
      if (res.id) {
        await restoreTimestamps(payload, 'event-photos', res.id, r.created_at)
        counts.created++
      }
    }
    if (!dryRun) await bumpSequence(payload, 'event-photos', await source.sequenceLastValue('event_photos'))
  },
}
