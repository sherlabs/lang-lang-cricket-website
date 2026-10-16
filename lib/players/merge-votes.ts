import { and, eq, inArray } from '@payloadcms/db-postgres/drizzle'
import type { PlayerTables } from './db'

/**
 * Best-player ballots follow a player merge (wave B spec 5.1). Ballot keys embed the player id as text (`player:<id>`), so a
 * relation repoint alone would leave stale keys. Runs inside the merge transaction (`tx`), with the merge's table handles.
 *
 * For source player S into target T:
 * - S's ballots move to T (the `voter` relation and the `voterKey`). If T already has a ballot for the same game the EARLIER
 *   `castAt` is kept and the other is deleted: ballots are never summed.
 * - Every pick of S becomes a pick of T. A ballot that now names T twice keeps the pick with the better (lower) place.
 * - With self votes off, a pick of T on T's own ballot is dropped; a ballot left with no picks is deleted.
 *
 * Undo restores only what it can prove is unchanged: moved ballots whose key still equals the rewritten value and moved picks that
 * still name T. Deleted collision ballots and dropped picks are not restored (the merge confirmation says so).
 */
export type VotesMergeSnapshot = { ballotsMoved: number[]; picksMoved: string[] }
export type VotesMergeCounts = { ballotsMoved: number; collisionsDeleted: number; picksDuplicatesDropped: number; selfPicksDropped: number; ballotsDeleted: number }

type Tx = {
  select: (...a: unknown[]) => { from: (t: unknown) => { where: (w: unknown) => Promise<Record<string, unknown>[]> } }
  update: (t: unknown) => { set: (v: Record<string, unknown>) => { where: (w: unknown) => Promise<unknown> } }
  delete: (t: unknown) => { where: (w: unknown) => Promise<unknown> }
}

const keyOf = (id: number) => `player:${id}`
const n = (v: unknown) => Number(v)

export async function repointBallots(txRaw: unknown, t: PlayerTables, sId: number, tId: number, allowSelfVote: boolean, stamp: string): Promise<{ snapshot: VotesMergeSnapshot; counts: VotesMergeCounts }> {
  const tx = txRaw as Tx
  const B = t.best_player_ballots
  const P = t.best_player_ballots_picks
  const counts: VotesMergeCounts = { ballotsMoved: 0, collisionsDeleted: 0, picksDuplicatesDropped: 0, selfPicksDropped: 0, ballotsDeleted: 0 }
  const snapshot: VotesMergeSnapshot = { ballotsMoved: [], picksMoved: [] }

  // 1. Ballots cast by S.
  const mine = await tx.select().from(B).where(eq(B.voter, sId))
  const theirs = await tx.select().from(B).where(eq(B.voter, tId))
  const targetByFixture = new Map(theirs.map((b) => [n(b.fixture), b]))
  const cast = (b: Record<string, unknown>) => (b.castAt ? new Date(String(b.castAt)).getTime() : Number.POSITIVE_INFINITY)
  const deleted = new Set<number>()
  for (const b of mine) {
    const other = targetByFixture.get(n(b.fixture))
    if (other) {
      // Same game voted twice by the merged person: keep the earlier ballot.
      const dropSource = cast(other) <= cast(b)
      const dropId = n(dropSource ? b.id : other.id)
      await tx.delete(B).where(eq(B.id, dropId))
      deleted.add(dropId)
      counts.collisionsDeleted += 1
      if (dropSource) continue
      targetByFixture.delete(n(b.fixture))
    }
    await tx.update(B).set({ voter: tId, voterKey: keyOf(tId), updatedAt: stamp }).where(eq(B.id, n(b.id)))
    snapshot.ballotsMoved.push(n(b.id))
    counts.ballotsMoved += 1
  }

  // 2. Picks naming S now name T.
  const sPicks = await tx.select().from(P).where(eq(P.player, sId))
  const live = sPicks.filter((p) => !deleted.has(n(p._parentID)))
  if (live.length) {
    await tx.update(P).set({ player: tId }).where(inArray(P.id, live.map((p) => String(p.id))))
    snapshot.picksMoved = live.map((p) => String(p.id))
  }

  // 3. A ballot that names T more than once keeps the better place.
  const tPicks = await tx.select().from(P).where(eq(P.player, tId))
  const byBallot = new Map<number, Record<string, unknown>[]>()
  for (const p of tPicks) byBallot.set(n(p._parentID), [...(byBallot.get(n(p._parentID)) ?? []), p])
  for (const list of byBallot.values()) {
    if (list.length < 2) continue
    const [, ...worse] = [...list].sort((a, b) => n(a.place) - n(b.place))
    await tx.delete(P).where(inArray(P.id, worse.map((p) => String(p.id))))
    counts.picksDuplicatesDropped += worse.length
  }

  // 4. T's own ballot must not name T (unless self votes are allowed).
  if (!allowSelfVote) {
    const own = await tx.select().from(B).where(eq(B.voter, tId))
    for (const b of own) {
      const self = await tx.select().from(P).where(and(eq(P._parentID, n(b.id)), eq(P.player, tId)))
      if (!self.length) continue
      await tx.delete(P).where(inArray(P.id, self.map((p) => String(p.id))))
      counts.selfPicksDropped += self.length
      const left = await tx.select().from(P).where(eq(P._parentID, n(b.id)))
      if (!left.length) {
        await tx.delete(B).where(eq(B.id, n(b.id)))
        counts.ballotsDeleted += 1
      }
    }
  }
  return { snapshot, counts }
}

/** Undo: moved ballots whose key still equals the rewritten value go back to S; moved picks that still name T go back to S. */
export async function restoreBallots(txRaw: unknown, t: PlayerTables, sId: number, tId: number, snap: VotesMergeSnapshot, stamp: string): Promise<void> {
  const tx = txRaw as Tx
  const B = t.best_player_ballots
  const P = t.best_player_ballots_picks
  if (snap.ballotsMoved.length) {
    await tx.update(B).set({ voter: sId, voterKey: keyOf(sId), updatedAt: stamp }).where(and(inArray(B.id, snap.ballotsMoved), eq(B.voterKey, keyOf(tId))))
  }
  if (snap.picksMoved.length) await tx.update(P).set({ player: sId }).where(and(inArray(P.id, snap.picksMoved), eq(P.player, tId)))
}
