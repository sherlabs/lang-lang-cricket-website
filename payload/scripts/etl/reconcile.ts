/**
 * `--update --reconcile-deletes` (spec §12.3, §13.4): the re-attempt fallback when the payload
 * schema must be kept. For every id-preserving collection, target rows whose id is ≤ the legacy
 * max (max id or sequence `last_value`) and missing from legacy are deleted; rows above it are
 * Payload-native and only reported. Deletes run through the Local API (`context.etl`, so cascades
 * and the legacy-blob delete guard apply) except `player-seasons`, which is plain drizzle like
 * its import. Children first. Aliases are keyed by `nameKey` and owned by the sync, so they are
 * left alone (a deleted player cascades its aliases).
 */
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { CollectionSlug } from 'payload'
import { ETL_CONTEXT, type EtlContext } from './media'
import { ID_PRESERVING } from './sequences'
import { tableOf } from './timestamps'

export async function reconcileDeletes(ctx: EtlContext, only?: readonly string[]): Promise<void> {
  const { payload, source, report, dryRun } = ctx
  for (const { collection, legacyTable } of [...ID_PRESERVING].reverse()) {
    if (only && !only.includes(collection)) continue
    const counts = report.counts(`reconcile:${collection}`)
    const legacyIds = new Set((await source.query<{ id: number }>(`SELECT id FROM "${source.schema}"."${legacyTable}"`)).map((r) => Number(r.id)))
    const legacyMax = Math.max(0, ...legacyIds, await source.sequenceLastValue(legacyTable))
    const res = (await payload.db.drizzle.execute(sql.raw(`SELECT id FROM "payload"."${tableOf(collection)}" ORDER BY id`))) as { rows: { id: number }[] }
    const ids = res.rows.map((r) => Number(r.id))
    counts.read = ids.length
    const stale = ids.filter((id) => id <= legacyMax && !legacyIds.has(id))
    const native = ids.filter((id) => id > legacyMax)
    if (native.length) {
      report.add({ step: 'reconcile', table: collection, kind: 'native-rows', detail: `${native.length} row(s) above the legacy max id ${legacyMax} kept: ${native.slice(0, 50).join(', ')}` })
    }
    for (const id of stale) {
      report.add({ step: 'reconcile', table: collection, id, kind: dryRun ? 'reconcile-delete-planned' : 'reconcile-deleted', detail: `id ≤ legacy max ${legacyMax} and missing from legacy` })
      if (dryRun) {
        counts.planned++
        continue
      }
      if (collection === 'player-seasons') {
        await payload.db.drizzle.execute(sql`DELETE FROM "payload"."player_seasons" WHERE id = ${id}`)
      } else {
        await payload.delete({ collection: collection as CollectionSlug, id, overrideAccess: true, context: { ...ETL_CONTEXT } })
      }
      counts.deleted++
    }
  }
}
