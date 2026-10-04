import { and, eq, inArray, lt, sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { relinkMatchPlayers } from '@/lib/match-store/write'
import { revalidateStats } from '@/lib/stats/tags'
import { playerTables } from './db'
import { planMerge } from './merge'
import { buildMergeSnapshot, revertTargetPatch, type MergeSnapshot, type SnapshotPlayer } from './merge-snapshot'
import { sameGameMessage } from './same-game'
import { pickCounts } from './season-math'

/**
 * The merge and its undo, on `payload.db.drizzle` (W2 spec 6.2). One transaction each, so a failure leaves both players
 * untouched. The merge writes a `merge-log` row (with the identity snapshot) inside the same transaction; the undo restores
 * identity only and marks the log `undone`. Season rows and appearances are never restored: the next sync rebuilds them.
 */
export const MERGE_LOG_TAG = 'merge-log'
export const MERGE_LOG_RETENTION_DAYS = 365

const PAGES = ['/players', '/stats', '/records', '/honours', '/players/compare', '/stats/opposition', '/records/partnerships']
export async function revalidateAfterMergeChange(extra: string[] = []): Promise<void> {
  await revalidateStats([...PAGES, ...extra])
  try {
    const { revalidateTag, revalidatePath } = await import('next/cache')
    revalidateTag(MERGE_LOG_TAG, { expire: 0 })
    revalidatePath('/players/[slug]', 'page')
  } catch {
    // outside a Next request (tests, scripts)
  }
}

type SharedGame = { date: string | null; opponent: string | null }
const int = (v: unknown) => Number(v)

/** The games both players appear in (stored club-side appearances). */
export async function sharedGamesOf(payload: Payload, a: number, b: number): Promise<{ matchIds: number[]; games: SharedGame[] }> {
  const t = playerTables(payload)
  const rows = await payload.db.drizzle.execute(
    sql`SELECT DISTINCT m.id AS id, m."local_date" AS date, COALESCE(m."opponent_org_name", m."opponent_name") AS opponent
        FROM ${t.match_appearances} x JOIN ${t.match_appearances} y ON x."match_id" = y."match_id" JOIN ${t.matches} m ON m.id = x."match_id"
        WHERE x."player_id" = ${a} AND y."player_id" = ${b} ORDER BY m.id`,
  )
  const list = ((rows as unknown as { rows?: { id: number; date: string | null; opponent: string | null }[] }).rows ?? [])
  return { matchIds: list.map((r) => int(r.id)), games: list.map((r) => ({ date: r.date, opponent: r.opponent })) }
}

export type MergeResult =
  | { ok: true; targetId: number; sourceSlug: string; targetSlug: string; logId: number }
  | { ok: false; status: number; message: string; code?: 'same_game'; sharedGames?: SharedGame[] }

export async function mergePlayerInto(
  payload: Payload,
  o: { sourceId: number; targetId: number; userId: number | null; confirmSameGame?: boolean },
): Promise<MergeResult> {
  const { sourceId: sId, targetId: tId } = o
  if (sId === tId) return { ok: false, status: 400, message: 'Pick a different player to merge into.' }
  const load = (id: number) =>
    payload.find({ collection: 'players', where: { id: { equals: id } }, depth: 0, joins: false, limit: 1, pagination: false, overrideAccess: true }).then((r) => r.docs[0])
  const seasonsOf = (id: number) =>
    payload.find({ collection: 'player-seasons', where: { player: { equals: id } }, depth: 0, pagination: false, overrideAccess: true }).then((r) => r.docs)
  const [source, target] = await Promise.all([load(sId), load(tId)])
  if (!source || !target) return { ok: false, status: 404, message: 'Player not found.' }

  // Same-game refusal: one UPDATE of all appearances would put one player on both sides of a partnership.
  const shared = await sharedGamesOf(payload, sId, tId)
  if (shared.matchIds.length && !o.confirmSameGame) {
    return {
      ok: false, status: 409, code: 'same_game', sharedGames: shared.games,
      message: sameGameMessage(source.displayName || `${source.firstName} ${source.lastName}`.trim(), target.displayName || `${target.firstName} ${target.lastName}`.trim(), shared.games),
    }
  }

  const [sourceSeasons, targetSeasons] = await Promise.all([seasonsOf(sId), seasonsOf(tId)])
  const asP = (p: typeof source) => ({ photo: typeof p.photo === 'number' ? p.photo : (p.photo?.id ?? null), bio: p.bio ?? '', isActiveDerived: Boolean(p.isActiveDerived) })
  const asRow = (r: (typeof sourceSeasons)[number]) => ({ id: r.id, teamId: r.teamId, ...pickCounts(r as never) })
  const plan = planMerge(asP(source), asP(target), sourceSeasons.map(asRow), targetSeasons.map(asRow))

  const t = playerTables(payload)
  const stamp = new Date().toISOString()
  const sourceName = source.displayName || `${source.firstName} ${source.lastName}`.trim()
  const logId = await payload.db.drizzle.transaction(async (tx) => {
    // 0. Snapshot, before any write.
    const [srcRow] = await tx.select().from(t.players).where(eq(t.players.id, sId))
    const aliasRows: { id: number; nameKey: string }[] = await tx.select({ id: t.player_aliases.id, nameKey: t.player_aliases.nameKey }).from(t.player_aliases).where(eq(t.player_aliases.player, sId))
    const honourRows: { id: number; _order: number; years: string | null; title: string }[] = await tx
      .select({ id: t.players_honours.id, _order: t.players_honours._order, years: t.players_honours.years, title: t.players_honours.title })
      .from(t.players_honours).where(eq(t.players_honours._parentID, sId))
    const [{ max }] = await tx.select({ max: sql<number>`COALESCE(MAX(${t.players_honours._order}), 0)` }).from(t.players_honours).where(eq(t.players_honours._parentID, tId))
    const peopleRows: { id: number }[] = await tx.select({ id: t.people.id }).from(t.people).where(eq(t.people.player, sId))
    const sponsorRows: { id: number }[] = await tx.select({ id: t.player_sponsors.id }).from(t.player_sponsors).where(eq(t.player_sponsors.player, sId))
    const snapshot = buildMergeSnapshot({
      source: srcRow as SnapshotPlayer, aliases: aliasRows, honours: honourRows, targetMaxHonourOrder: Number(max),
      targetBefore: asP(target), plan, peopleIds: peopleRows.map((r) => int(r.id)), playerSponsorIds: sponsorRows.map((r) => int(r.id)),
    })

    // 1. Target patch (photo/bio fill-if-empty, OR of derived activity).
    await tx.update(t.players).set({ ...plan.targetPatch, updatedAt: stamp }).where(eq(t.players.id, tId))
    // 2. Aliases follow the identity.
    await tx.update(t.player_aliases).set({ player: tId, updatedAt: stamp }).where(eq(t.player_aliases.player, sId))
    // 3. Honours go after the target's own (`_order` is 1-based; continue from its MAX).
    await tx.update(t.players_honours).set({ _parentID: tId, _order: sql`${t.players_honours._order} + ${Number(max)}` }).where(eq(t.players_honours._parentID, sId))
    // 4. Same team on both sides: combined counts into the target row…
    for (const c of plan.combine) await tx.update(t.player_seasons).set({ ...c.counts, updatedAt: stamp }).where(eq(t.player_seasons.id, c.targetRowId))
    // 5. …and the source row goes.
    if (plan.combine.length) await tx.delete(t.player_seasons).where(inArray(t.player_seasons.id, plan.combine.map((c) => c.sourceRowId)))
    // 6. The rest of the source's seasons move.
    if (plan.moveSeasonIds.length) {
      await tx.update(t.player_seasons).set({ player: tId, updatedAt: stamp }).where(and(eq(t.player_seasons.player, sId), inArray(t.player_seasons.id, plan.moveSeasonIds)))
    }
    // 6b. A committee entry and player sponsorships follow the identity.
    await tx.update(t.people).set({ player: tId, updatedAt: stamp }).where(eq(t.people.player, sId))
    await tx.update(t.player_sponsors).set({ player: tId, updatedAt: stamp }).where(eq(t.player_sponsors.player, sId))
    // 6c. Stored match appearances follow the identity. A game both were listed in (confirmed twice) keeps its source row unlinked.
    if (shared.matchIds.length) {
      await tx.update(t.match_appearances).set({ player: null, updatedAt: stamp }).where(and(eq(t.match_appearances.player, sId), inArray(t.match_appearances.match, shared.matchIds)))
    }
    await tx.update(t.match_appearances).set({ player: tId, updatedAt: stamp }).where(eq(t.match_appearances.player, sId))
    // 7. The log row (inside the transaction, so it exists exactly when the merge happened), then the source and anything still pointing at it.
    const [log] = await tx
      .insert(t.merge_log)
      .values({ kind: 'merge', status: 'applied', sourcePlayerId: sId, sourceName, targetPlayer: tId, snapshot, createdBy: o.userId, createdAt: stamp, updatedAt: stamp })
      .returning({ id: t.merge_log.id })
    await tx.delete(t.player_aliases).where(eq(t.player_aliases.player, sId))
    await tx.delete(t.player_seasons).where(eq(t.player_seasons.player, sId))
    await tx.delete(t.players).where(eq(t.players.id, sId))
    return int(log.id)
  })

  await purgeOldMergeLog(payload)
  await revalidateAfterMergeChange([`/players/${source.slug}`, `/players/${target.slug}`])
  return { ok: true, targetId: tId, sourceSlug: String(source.slug ?? ''), targetSlug: String(target.slug ?? ''), logId }
}

export type UndoResult = { ok: true; playerId: number; relinked: number } | { ok: false; status: number; message: string }

export async function undoMerge(payload: Payload, logId: number, userId: number | null): Promise<UndoResult> {
  const t = playerTables(payload)
  const db = payload.db.drizzle
  const [log] = await db.select().from(t.merge_log).where(eq(t.merge_log.id, logId))
  if (!log || log.kind !== 'merge') return { ok: false, status: 404, message: 'That merge was not found.' }
  if (log.status === 'undone') return { ok: false, status: 409, message: 'That merge has already been undone.' }
  const snap = log.snapshot as MergeSnapshot | null
  if (!snap || snap.version !== 1) return { ok: false, status: 409, message: 'This merge cannot be undone (its record is incomplete).' }
  const sId = int(snap.source.id)
  if (log.targetPlayer == null) return { ok: false, status: 409, message: 'The player it was merged into no longer exists, perhaps because it was merged again. Undo that later merge first.' }
  const tId = int(log.targetPlayer)
  const [target] = await db.select().from(t.players).where(eq(t.players.id, tId))
  if (!target) return { ok: false, status: 409, message: 'The player it was merged into no longer exists, perhaps because it was merged again. Undo that later merge first.' }
  const [clash] = await db.select({ id: t.players.id }).from(t.players).where(eq(t.players.id, sId))
  if (clash) return { ok: false, status: 409, message: 'This player is already back. Nothing to undo.' }

  const stamp = new Date().toISOString()
  await db.transaction(async (tx) => {
    // The source player row, with its original id (the serial sequence is unaffected). A slug someone took since gets a suffix.
    const row = { ...snap.source, updatedAt: stamp } as Record<string, unknown>
    const [taken] = await tx.select({ id: t.players.id }).from(t.players).where(eq(t.players.slug, String(row.slug)))
    if (taken) row.slug = `${String(row.slug)}-restored`
    await tx.insert(t.players).values(row)

    // Aliases route the source's name key to it again (future syncs and the relink below follow them).
    for (const a of snap.aliases) {
      const moved = await tx.update(t.player_aliases).set({ player: sId, updatedAt: stamp }).where(eq(t.player_aliases.id, a.id)).returning({ id: t.player_aliases.id })
      if (!moved.length) await tx.insert(t.player_aliases).values({ id: a.id, nameKey: a.nameKey, player: sId, createdAt: stamp, updatedAt: stamp }).onConflictDoNothing()
    }
    // Honours go back by their recorded ids and positions.
    for (const h of snap.honours) {
      await tx.update(t.players_honours).set({ _parentID: sId, _order: h.order }).where(and(eq(t.players_honours.id, h.id), eq(t.players_honours._parentID, tId)))
    }
    if (snap.peopleIds.length) await tx.update(t.people).set({ player: sId, updatedAt: stamp }).where(and(inArray(t.people.id, snap.peopleIds), eq(t.people.player, tId)))
    if (snap.playerSponsorIds.length) await tx.update(t.player_sponsors).set({ player: sId, updatedAt: stamp }).where(and(inArray(t.player_sponsors.id, snap.playerSponsorIds), eq(t.player_sponsors.player, tId)))
    // The target patch is reverted only for fields still holding the merged value.
    const patch = revertTargetPatch(snap, { photo: target.photo === null || target.photo === undefined ? null : int(target.photo), bio: target.bio ?? '', isActiveDerived: target.isActiveDerived === true })
    if (Object.keys(patch).length) await tx.update(t.players).set({ ...patch, updatedAt: stamp }).where(eq(t.players.id, tId))

    await tx.update(t.merge_log).set({ status: 'undone', undoneAt: stamp, undoneBy: userId, updatedAt: stamp }).where(eq(t.merge_log.id, logId))
  })

  // The aliases are back, so the source's appearances relink to it by name key.
  const relinked = await relinkMatchPlayers(payload)
  await revalidateAfterMergeChange([`/players/${String(snap.source.slug)}`])
  return { ok: true, playerId: sId, relinked }
}

/** Dismisses a suggested pair ("not the same person"): it is not suggested again. */
export async function dismissPair(payload: Payload, a: number, b: number, userId: number | null): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = playerTables(payload)
  const found: { id: number }[] = await payload.db.drizzle.select({ id: t.players.id }).from(t.players).where(inArray(t.players.id, [a, b]))
  if (found.length !== 2) return { ok: false, message: 'One of those players no longer exists.' }
  const stamp = new Date().toISOString()
  const lo = Math.min(a, b), hi = Math.max(a, b)
  // The target column is a foreign key that clears when that player goes, so the pair itself is also kept in the snapshot.
  await payload.db.drizzle.insert(t.merge_log).values({ kind: 'dismissed', status: 'dismissed', sourcePlayerId: lo, targetPlayer: hi, snapshot: { pair: [lo, hi] }, createdBy: userId, createdAt: stamp, updatedAt: stamp })
  await revalidateAfterMergeChange()
  return { ok: true }
}

/** The log keeps one year of merge history. "Not the same person" decisions are kept for good, so a pair is never suggested again. */
export async function purgeOldMergeLog(payload: Payload, now = new Date()): Promise<number> {
  const t = playerTables(payload)
  const cutoff = new Date(now.getTime() - MERGE_LOG_RETENTION_DAYS * 86_400_000).toISOString()
  const gone: { id: number }[] = await payload.db.drizzle.delete(t.merge_log).where(and(eq(t.merge_log.kind, 'merge'), lt(t.merge_log.createdAt, cutoff))).returning({ id: t.merge_log.id })
  return gone.length
}
