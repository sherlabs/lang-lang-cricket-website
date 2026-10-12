import { and, eq, inArray } from '@payloadcms/db-postgres/drizzle'
import type { PlayerTables } from './db'

/**
 * Net attendance follows a player merge (wave B spec 5.1). `playerKey` embeds the player id as text (`player:<id>`), so a relation
 * repoint alone would leave stale keys. Runs inside the merge transaction (`tx`).
 *
 * For source player S into target T: S's check-ins move to T (the `player` relation and the key). If T already checked in to the same
 * session the EARLIER `checkedInAt` is kept and the other row is deleted. Undo puts moved rows back only while their key still equals
 * the rewritten value; deleted collision rows are not restored (the merge confirmation says so).
 */
export type NetsMergeSnapshot = { attendanceMoved: number[] }
export type NetsMergeCounts = { attendanceMoved: number; collisionsDeleted: number }

type Tx = {
  select: (...a: unknown[]) => { from: (t: unknown) => { where: (w: unknown) => Promise<Record<string, unknown>[]> } }
  update: (t: unknown) => { set: (v: Record<string, unknown>) => { where: (w: unknown) => Promise<unknown> } }
  delete: (t: unknown) => { where: (w: unknown) => Promise<unknown> }
}

const keyOf = (id: number) => `player:${id}`
const n = (v: unknown) => Number(v)

export async function repointAttendance(txRaw: unknown, t: PlayerTables, sId: number, tId: number, stamp: string): Promise<{ snapshot: NetsMergeSnapshot; counts: NetsMergeCounts }> {
  const tx = txRaw as Tx
  const A = t.net_attendance
  const counts: NetsMergeCounts = { attendanceMoved: 0, collisionsDeleted: 0 }
  const snapshot: NetsMergeSnapshot = { attendanceMoved: [] }
  const mine = await tx.select().from(A).where(eq(A.player, sId))
  if (!mine.length) return { snapshot, counts }
  const theirs = await tx.select().from(A).where(eq(A.player, tId))
  const targetBySession = new Map(theirs.map((r) => [n(r.session), r]))
  const at = (r: Record<string, unknown>) => (r.checkedInAt ? new Date(String(r.checkedInAt)).getTime() : Number.POSITIVE_INFINITY)
  for (const r of mine) {
    const other = targetBySession.get(n(r.session))
    if (other) {
      const dropSource = at(other) <= at(r)
      await tx.delete(A).where(eq(A.id, n(dropSource ? r.id : other.id)))
      counts.collisionsDeleted += 1
      if (dropSource) continue
    }
    await tx.update(A).set({ player: tId, playerKey: keyOf(tId), updatedAt: stamp }).where(eq(A.id, n(r.id)))
    snapshot.attendanceMoved.push(n(r.id))
    counts.attendanceMoved += 1
  }
  return { snapshot, counts }
}

export async function restoreAttendance(txRaw: unknown, t: PlayerTables, sId: number, tId: number, snap: NetsMergeSnapshot, stamp: string): Promise<void> {
  const tx = txRaw as Tx
  const A = t.net_attendance
  if (snap.attendanceMoved.length) {
    await tx.update(A).set({ player: sId, playerKey: keyOf(sId), updatedAt: stamp }).where(and(inArray(A.id, snap.attendanceMoved), eq(A.playerKey, keyOf(tId))))
  }
}
