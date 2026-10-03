import { ETL_CONTEXT } from '../media'
import { importableParentIds } from '../rows'
import { importedPlayerIds } from '../rules'
import type { EtlStep } from './types'

type Row = { name_key: string; player_id: number }

/**
 * Step 13: `player-aliases`. The legacy primary key is the text `name_key`, so new serial ids
 * are fine; idempotency is an upsert by `nameKey` (unique). Aliases of players that did not
 * import are skipped and reported.
 */
export const playerAliasesStep: EtlStep = {
  name: 'player-aliases',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('player-aliases')
    const rows = await source.rows<Row>('player_aliases', 'name_key')
    counts.read = rows.length
    const players = await importableParentIds(ctx, 'players', importedPlayerIds(await source.rows('players')))
    for (const r of rows) {
      const where = { step: 'player-aliases', table: 'player_aliases', id: r.name_key }
      if (!players.has(r.player_id)) {
        report.add({ ...where, field: 'player_id', kind: 'orphan-skipped', detail: `player ${r.player_id} is not in the target` })
        counts.skipped++
        continue
      }
      if (dryRun) {
        counts.planned++
        continue
      }
      const { docs } = await payload.find({ collection: 'player-aliases', where: { nameKey: { equals: r.name_key } }, limit: 1, depth: 0, overrideAccess: true })
      const existing = docs[0]
      if (existing && (!update || (typeof existing.player === 'number' ? existing.player : existing.player.id) === r.player_id)) {
        counts.skipped++
        continue
      }
      if (existing) {
        await payload.update({ collection: 'player-aliases', id: existing.id, data: { player: r.player_id }, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
        counts.updated++
      } else {
        await payload.create({ collection: 'player-aliases', data: { nameKey: r.name_key, player: r.player_id }, overrideAccess: true, depth: 0, context: { ...ETL_CONTEXT } })
        counts.created++
      }
    }
  },
}
