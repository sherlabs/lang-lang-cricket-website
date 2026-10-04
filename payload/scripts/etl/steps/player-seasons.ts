import { getTableColumns, sql } from '@payloadcms/db-postgres/drizzle'
import { chunk, playerTables } from '../../../../lib/players/db'
import { bumpSequence, importableParentIds } from '../rows'
import { importedPlayerIds } from '../rules'
import type { EtlStep } from './types'

type Row = {
  id: number
  player_id: number
  season_name: string
  season_order: number
  team_id: string
  team_name: string
  grade_name: string | null
  games: number
  bat_innings: number
  bat_not_outs: number
  bat_runs: number
  bat_high_score: number
  bat_high_score_not_out: boolean
  bat_balls: number
  bat_fours: number
  bat_sixes: number
  bowl_balls: number
  bowl_maidens: number
  bowl_runs: number
  bowl_wickets: number
  bowl_best_wickets: number
  bowl_best_runs: number
  catches: number
}

const n = (v: unknown) => Number(v ?? 0)

/**
 * Step 14: `player-seasons`, bulk-inserted through drizzle in chunks of 500 with ids kept and
 * `ON CONFLICT (id) DO NOTHING`, so a partially failed run resumes cleanly (no row-count
 * shortcut). The sync rewrites these rows nightly anyway. Seasons of players that did not
 * import are skipped and reported. `--update` rewrites existing ids (`ON CONFLICT (id) DO UPDATE`):
 * after a rollback the legacy sync hands out ids from the range Payload's sync used, so an id
 * can exist on both sides with different data (spec §13.4).
 */
export const playerSeasonsStep: EtlStep = {
  name: 'player-seasons',
  async run(ctx) {
    const { payload, source, report, dryRun, update } = ctx
    const counts = report.counts('player-seasons')
    const rows = await source.rows<Row>('player_seasons')
    counts.read = rows.length
    if (dryRun) {
      counts.planned = rows.length
      return
    }
    const t = playerTables(payload)
    const players = await importableParentIds(ctx, 'players', importedPlayerIds(await source.rows('players')))
    const stamp = new Date().toISOString()
    const values = []
    for (const r of rows) {
      if (!players.has(r.player_id)) {
        report.add({ step: 'player-seasons', table: 'player_seasons', id: r.id, field: 'player_id', kind: 'orphan-skipped', detail: `player ${r.player_id} is not in the target` })
        counts.skipped++
        continue
      }
      values.push({
        id: r.id,
        player: r.player_id,
        seasonName: r.season_name,
        seasonOrder: n(r.season_order),
        teamId: r.team_id,
        teamName: r.team_name,
        gradeName: r.grade_name,
        games: n(r.games),
        batInnings: n(r.bat_innings),
        batNotOuts: n(r.bat_not_outs),
        batRuns: n(r.bat_runs),
        batHighScore: n(r.bat_high_score),
        batHighScoreNotOut: Boolean(r.bat_high_score_not_out),
        batBalls: n(r.bat_balls),
        batFours: n(r.bat_fours),
        batSixes: n(r.bat_sixes),
        bowlBalls: n(r.bowl_balls),
        bowlMaidens: n(r.bowl_maidens),
        bowlRuns: n(r.bowl_runs),
        bowlWickets: n(r.bowl_wickets),
        bowlBestWickets: n(r.bowl_best_wickets),
        bowlBestRuns: n(r.bowl_best_runs),
        catches: n(r.catches),
        createdAt: stamp,
        updatedAt: stamp,
      })
    }
    // Every column but id / createdAt takes the legacy row's value on --update.
    const updateSet = Object.fromEntries(
      Object.entries(getTableColumns(t.player_seasons))
        .filter(([key]) => key !== 'id' && key !== 'createdAt')
        .map(([key, column]) => [key, sql.raw(`excluded."${(column as { name: string }).name}"`)]),
    )
    for (const part of chunk(values, 500)) {
      const insert = payload.db.drizzle.insert(t.player_seasons).values(part)
      if (update) {
        // xmax = 0 only on a freshly inserted row version, so it tells created from updated.
        const written: { id: number; inserted: boolean }[] = await insert
          .onConflictDoUpdate({ target: t.player_seasons.id, set: updateSet })
          .returning({ id: t.player_seasons.id, inserted: sql<boolean>`(xmax = 0)` })
        const created = written.filter((w) => w.inserted).length
        counts.created += created
        counts.updated += written.length - created
        continue
      }
      const inserted: { id: number }[] = await insert
        .onConflictDoNothing({ target: t.player_seasons.id })
        .returning({ id: t.player_seasons.id })
      counts.created += inserted.length
      counts.skipped += part.length - inserted.length
    }
    await bumpSequence(payload, 'player-seasons', await source.sequenceLastValue('player_seasons'))
  },
}
