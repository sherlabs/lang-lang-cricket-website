import { count, eq, max, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { chunk } from '@/lib/players/db'
import type { MatchBundle } from '@/lib/playhq/match-rows'
import { MATCH_SCHEMA, matchTables } from './db'

/**
 * Writes for the per-match store (WP-M, spec M4). One transaction per game; children are replaced
 * wholesale when `sourceHash` changed, so consumers must reference `matches.id` or `gameId`, never
 * child row ids. Raw drizzle: collection hooks do not run and nothing is revalidated here.
 */

export type UpsertAction = 'created' | 'updated' | 'unchanged'

/** `nameKey` to player id, as read from `player_aliases` after the sync's new-player insert. */
export type AliasMap = ReadonlyMap<string, number>

export async function upsertMatchBundle(payload: Payload, bundle: MatchBundle, aliasMap: AliasMap): Promise<UpsertAction> {
  const t = matchTables(payload)
  const db = payload.db.drizzle
  const { match } = bundle

  // Unchanged rows: no transaction and no write (a changed fixture stamp alone only touches two columns,
  // so the nightly sync does not refetch an unchanged scorecard every night).
  const [existing] = await db
    .select({ id: t.matches.id, sourceHash: t.matches.sourceHash, playhqUpdatedAt: t.matches.playhqUpdatedAt })
    .from(t.matches)
    .where(eq(t.matches.gameId, match.gameId))
    .limit(1)
  if (existing && existing.sourceHash === bundle.sourceHash) {
    if (match.playhqUpdatedAt && existing.playhqUpdatedAt !== match.playhqUpdatedAt) {
      const stamp = new Date().toISOString()
      await db.update(t.matches).set({ playhqUpdatedAt: match.playhqUpdatedAt, syncedAt: stamp }).where(eq(t.matches.id, existing.id))
    }
    return 'unchanged'
  }

  await db.transaction(async (tx) => {
    const stamp = new Date().toISOString()
    const values = { ...match, sourceHash: bundle.sourceHash, syncedAt: stamp, updatedAt: stamp }
    const [row] = await tx
      .insert(t.matches)
      .values({ ...values, createdAt: stamp })
      .onConflictDoUpdate({ target: t.matches.gameId, set: values })
      .returning({ id: t.matches.id })
    const matchId = row.id as number

    // Children go in dependency order; the unique keys make a duplicate impossible.
    for (const table of [t.match_batting, t.match_bowling, t.match_fielding, t.match_innings, t.match_appearances]) {
      await tx.delete(table).where(eq(table.match, matchId))
    }

    const inningsIds = new Map<number, number>()
    if (bundle.innings.length) {
      const inserted: { id: number; sequenceNo: number }[] = await tx
        .insert(t.match_innings)
        .values(bundle.innings.map((i) => ({ ...i, match: matchId, createdAt: stamp, updatedAt: stamp })))
        .returning({ id: t.match_innings.id, sequenceNo: t.match_innings.sequenceNo })
      for (const r of inserted) inningsIds.set(Number(r.sequenceNo), r.id)
    }
    for (const part of chunk(bundle.appearances, 200)) {
      await tx.insert(t.match_appearances).values(
        part.map((a) => ({
          ...a, match: matchId, player: a.isClubSide && a.nameKey ? (aliasMap.get(a.nameKey) ?? null) : null,
          createdAt: stamp, updatedAt: stamp,
        })),
      )
    }
    const child = <R extends { inningsSeq: number }>(rows: R[]) =>
      rows
        .filter((r) => inningsIds.has(r.inningsSeq))
        .map(({ inningsSeq, ...rest }) => ({ ...rest, innings: inningsIds.get(inningsSeq)!, match: matchId, createdAt: stamp, updatedAt: stamp }))
    for (const [table, rows] of [[t.match_batting, bundle.batting], [t.match_bowling, bundle.bowling], [t.match_fielding, bundle.fielding]] as const) {
      for (const part of chunk(child(rows as { inningsSeq: number }[]), 200)) await tx.insert(table).values(part)
    }
  })
  return existing ? 'updated' : 'created'
}

/**
 * Makes every club-side appearance follow `player_aliases` (one UPDATE, one table). Runs after the
 * alias heal step of every sync: it links rows whose alias was added later, restores rows whose
 * player was deleted (`ON DELETE SET NULL`), and follows a hand-edited alias. Returns the rows changed.
 */
export async function relinkMatchPlayers(payload: Payload): Promise<number> {
  const stamp = new Date().toISOString()
  const res = await payload.db.drizzle.execute(
    sql.raw(
      `UPDATE "${MATCH_SCHEMA}"."match_appearances" ma SET "player_id" = pa."player_id", "updated_at" = '${stamp}' ` +
        `FROM "${MATCH_SCHEMA}"."player_aliases" pa WHERE ma."name_key" = pa."name_key" AND ma."is_club_side" = true AND ma."player_id" IS DISTINCT FROM pa."player_id"`,
    ),
  )
  return Number((res as { rowCount?: number }).rowCount ?? 0)
}

export type MatchStoreStats = { matches: number; innings: number; appearances: number; batting: number; bowling: number; fielding: number; lastSyncedAt: string | null }

export async function matchStoreStats(payload: Payload): Promise<MatchStoreStats> {
  const t = matchTables(payload)
  const db = payload.db.drizzle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = async (table: any) => Number((await db.select({ n: count() }).from(table))[0].n)
  const [last] = await db.select({ at: max(t.matches.syncedAt) }).from(t.matches)
  return {
    matches: await n(t.matches), innings: await n(t.match_innings), appearances: await n(t.match_appearances),
    batting: await n(t.match_batting), bowling: await n(t.match_bowling), fielding: await n(t.match_fielding),
    lastSyncedAt: (last?.at as string | null) ?? null,
  }
}

/** gameId to the fixture `updatedAt` stored with it, for the stale-cache rule (a differing stamp means the scorecard was corrected). */
export async function storedFixtureStamps(payload: Payload): Promise<Map<string, string | null>> {
  const t = matchTables(payload)
  const rows: { gameId: string; playhqUpdatedAt: string | null }[] = await payload.db.drizzle
    .select({ gameId: t.matches.gameId, playhqUpdatedAt: t.matches.playhqUpdatedAt })
    .from(t.matches)
  return new Map(rows.map((r) => [r.gameId, r.playhqUpdatedAt]))
}
