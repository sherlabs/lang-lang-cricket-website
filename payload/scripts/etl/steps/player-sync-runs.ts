import { bumpSequence, upsertRow } from '../rows'
import { SYNC_RUN_STATUSES } from '../rules'
import type { EtlStep } from './types'

type Row = {
  id: number
  started_at: Date
  finished_at: Date | null
  status: string
  players_created: number
  season_rows: number
  error: string | null
}


/**
 * Step 15: `player-sync-runs` (id kept). The legacy table has no created/updated columns:
 * `createdAt` = `startedAt`, `updatedAt` = `finishedAt` (or `startedAt`). A legacy run left
 * `running` stays `running`; the sync lock ignores it once it is over 10 minutes old.
 */
export const playerSyncRunsStep: EtlStep = {
  name: 'player-sync-runs',
  async run(ctx) {
    const { payload, source, report, dryRun } = ctx
    const counts = report.counts('player-sync-runs')
    const rows = await source.rows<Row>('player_sync_runs')
    counts.read = rows.length
    for (const r of rows) {
      if (!SYNC_RUN_STATUSES.has(r.status)) {
        report.add({ step: 'player-sync-runs', table: 'player_sync_runs', id: r.id, field: 'status', kind: 'skipped', detail: `unknown status "${r.status}"` })
        counts.skipped++
        continue
      }
      await upsertRow(ctx, {
        step: 'player-sync-runs',
        collection: 'player-sync-runs',
        id: r.id,
        data: {
          startedAt: r.started_at.toISOString(),
          finishedAt: r.finished_at ? r.finished_at.toISOString() : null,
          status: r.status,
          playersCreated: Number(r.players_created ?? 0),
          seasonRows: Number(r.season_rows ?? 0),
          error: r.error,
        },
        createdAt: r.started_at,
        updatedAt: r.finished_at ?? r.started_at,
      })
    }
    if (!dryRun) await bumpSequence(payload, 'player-sync-runs', await source.sequenceLastValue('player_sync_runs'))
  },
}
