import { and, count, eq, max, notInArray, or, sql } from '@payloadcms/db-postgres/drizzle'
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

/** `gameId` to the stored identity, hash and fixture stamp of each match: one query instead of a SELECT per game. */
export type StoredMatchIndex = Map<string, { id: number; sourceHash: string | null; playhqUpdatedAt: string | null }>

export async function storedMatchIndex(payload: Payload): Promise<StoredMatchIndex> {
  const t = matchTables(payload)
  const rows: { gameId: string; id: number; sourceHash: string | null; playhqUpdatedAt: string | null }[] = await payload.db.drizzle
    .select({ gameId: t.matches.gameId, id: t.matches.id, sourceHash: t.matches.sourceHash, playhqUpdatedAt: t.matches.playhqUpdatedAt })
    .from(t.matches)
    // Imported games are not the sync's: they never feed its stored-game index.
    .where(eq(t.matches.source, 'playhq'))
  return new Map(rows.map((r) => [r.gameId, { id: Number(r.id), sourceHash: r.sourceHash, playhqUpdatedAt: r.playhqUpdatedAt }]))
}

/**
 * `index` (from `storedMatchIndex`, read once per run) replaces the per-game SELECT. It is only a cache of what was
 * stored when the run began: a game missing from it is simply written (the upsert is on `gameId`, so a row stored in
 * the meantime is updated, not duplicated).
 */
export async function upsertMatchBundle(payload: Payload, bundle: MatchBundle, aliasMap: AliasMap, index?: StoredMatchIndex): Promise<UpsertAction> {
  const t = matchTables(payload)
  const db = payload.db.drizzle
  const { match } = bundle

  // Unchanged rows: no transaction and no write (a changed fixture stamp alone only touches two columns,
  // so the nightly sync does not refetch an unchanged scorecard every night).
  const [existing] = index
    ? [index.get(match.gameId)].filter((e): e is NonNullable<typeof e> => Boolean(e))
    : await db
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
    await writeBundle(tx, t, bundle, aliasMap, { source: 'playhq' })
  })
  return existing ? 'updated' : 'created'
}

/**
 * Upserts one game and replaces its children, inside the caller's transaction (`tx`). The sync passes `source: 'playhq'`; the
 * historical import passes `source: 'import'` and its batch tag. Children go in dependency order; the unique keys make a duplicate impossible.
 */
export async function writeBundle(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  t: ReturnType<typeof matchTables>,
  bundle: MatchBundle,
  aliasMap: AliasMap,
  origin: { source: 'playhq' | 'import'; importBatch?: string | null },
): Promise<number> {
  const { match } = bundle
  const stamp = new Date().toISOString()
  const values = { ...match, source: origin.source, importBatch: origin.importBatch ?? null, sourceHash: bundle.sourceHash, syncedAt: stamp, updatedAt: stamp }
  const [row] = await tx
    .insert(t.matches)
    .values({ ...values, createdAt: stamp })
    .onConflictDoUpdate({ target: t.matches.gameId, set: values })
    .returning({ id: t.matches.id })
  const matchId = row.id as number

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
  return matchId
}

/**
 * Makes every club-side appearance follow `player_aliases` (one UPDATE, one table). Runs after the
 * alias heal step of every sync: it links rows whose alias was added later, restores rows whose
 * player was deleted (`ON DELETE SET NULL`), and follows a hand-edited alias, and clears a link whose alias was deleted. Returns the rows changed.
 */
export async function relinkMatchPlayers(payload: Payload): Promise<number> {
  const stamp = new Date().toISOString()
  const res = await payload.db.drizzle.execute(
    sql.raw(
      `UPDATE "${MATCH_SCHEMA}"."match_appearances" ma SET "player_id" = pa."player_id", "updated_at" = '${stamp}' ` +
        `FROM "${MATCH_SCHEMA}"."player_aliases" pa WHERE ma."name_key" = pa."name_key" AND ma."is_club_side" = true AND ma."player_id" IS DISTINCT FROM pa."player_id"`,
    ),
  )
  // A hand-deleted alias: the club-side row keeps a link that nothing backs any more, so clear it.
  const cleared = await payload.db.drizzle.execute(
    sql.raw(
      `UPDATE "${MATCH_SCHEMA}"."match_appearances" ma SET "player_id" = NULL, "updated_at" = '${stamp}' ` +
        `WHERE ma."is_club_side" = true AND ma."player_id" IS NOT NULL AND ma."name_key" IS NOT NULL ` +
        `AND NOT EXISTS (SELECT 1 FROM "${MATCH_SCHEMA}"."player_aliases" pa WHERE pa."name_key" = ma."name_key")`,
    ),
  )
  return Number((res as { rowCount?: number }).rowCount ?? 0) + Number((cleared as { rowCount?: number }).rowCount ?? 0)
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

/**
 * Removes stored matches that PlayHQ no longer reports for the synced (team, season) pairs (a game that
 * went club-vs-club, non-FINAL, abandoned or vanished). `pairs` are `{ clubTeamId, seasonName }`; only
 * games absent from `keepGameIds` are deleted, children go via ON DELETE cascade. Returns the count removed.
 */
export async function pruneStaleMatches(
  payload: Payload,
  pairs: { clubTeamId: string; seasonName: string }[],
  keepGameIds: string[],
): Promise<number> {
  if (!pairs.length) return 0
  const t = matchTables(payload)
  const inPair = or(...pairs.map((p) => and(eq(t.matches.clubTeamId, p.clubTeamId), eq(t.matches.seasonName, p.seasonName))))
  // Never an imported game, whatever its synthetic team id.
  const mine = and(inPair, eq(t.matches.source, 'playhq'))
  const where = keepGameIds.length ? and(mine, notInArray(t.matches.gameId, keepGameIds)) : mine
  const removed: { id: number }[] = await payload.db.drizzle.transaction(async (tx) => tx.delete(t.matches).where(where).returning({ id: t.matches.id }))
  return removed.length
}
