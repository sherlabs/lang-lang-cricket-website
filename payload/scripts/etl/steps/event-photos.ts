import { ETL_CONTEXT, fileConflict, importFile } from '../media'
import { bumpSequence, existingById, importableParentIds, restoreTimestamps } from '../rows'
import { EVENT_PHOTO_STATUSES, duplicateUrlIds, eventPhotoImportable, importedEventIds } from '../rules'
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
 * Orphans (no such legacy event, or one the events step skipped) are skipped and reported. A status other than
 * approved/pending (the legacy app deleted rejects, so e.g. `rejected` is anomalous) is
 * skipped and reported rather than coerced: coercing to `pending` would resurface an
 * already-rejected photo in the review queue. A photo whose URL an earlier imported photo
 * already has is a resubmission: skipped and reported (`legacyUrl` is unique here, so it could
 * only be imported without a file, which an admin could then approve).
 */
export const eventPhotosStep: EtlStep = {
  name: 'event-photos',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('event-photos')
    const events = await importableParentIds(ctx, 'events', importedEventIds(await source.rows('events')))
    const rows = await source.rows<Row>('event_photos')
    const duplicates = duplicateUrlIds(rows, eventPhotoImportable(events))
    counts.read = rows.length
    for (const r of rows) {
      const where = { step: 'event-photos', table: 'event_photos', id: r.id, field: 'url' }
      if (duplicates.has(r.id)) {
        report.add({ ...where, url: r.url, kind: 'duplicate-url-skipped', detail: 'an earlier event photo has the same URL (a resubmission); skipped' })
        counts.skipped++
        continue
      }
      if (!events.has(r.event_id)) {
        report.add({ ...where, field: 'event_id', url: r.url, kind: 'orphan-skipped', detail: `event ${r.event_id} does not exist or was not imported` })
        counts.skipped++
        continue
      }
      if (!EVENT_PHOTO_STATUSES.has(r.status)) {
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
        // The kept file must be this legacy row's: after a rollback a reused id can hold a
        // Payload-native row of the failed window (§13.4); if not, the row is replaced.
        const conflict = await fileConflict(ctx, 'event-photos', existing, r.url)
        if (!conflict) {
          await payload.update({ collection: 'event-photos', id: r.id, data, overrideAccess: true, depth: 0, context: { etl: true, disableRevalidate: true } })
          await restoreTimestamps(payload, 'event-photos', r.id, r.created_at)
          counts.updated++
          continue
        }
        report.add({ ...where, kind: 'file-conflict-replaced', detail: `${conflict}; row deleted and re-imported` })
        await payload.delete({ collection: 'event-photos', id: r.id, overrideAccess: true, context: { ...ETL_CONTEXT } })
        counts.deleted++
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
