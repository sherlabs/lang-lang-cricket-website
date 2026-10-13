import type { Payload, PayloadRequest, Where } from 'payload'
import { effectiveLock, type RoundFixture } from './rounds'

/**
 * Server-side lock handling for a fantasy round (wave F spec 4.5). Reads the CURRENT selection fixtures at the moment of the call, so
 * a start time that moved earlier since the last nightly sync still locks the round, and writes the lowered value back. A lock is
 * only ever lowered, never raised.
 */
const DAY = 86_400_000
const iso = (t: number): string => new Date(t).toISOString().slice(0, 10)

/** Monday and Sunday (club-local dates) of the weekend keyed by `weekendKey` (a Saturday). */
export const weekendBounds = (weekendKey: string): { monday: string; sunday: string } => {
  const sat = Date.parse(`${weekendKey}T00:00:00Z`)
  return { monday: iso(sat - 5 * DAY), sunday: iso(sat + DAY) }
}

export async function liveFixturesOfWeekend(payload: Payload, weekendKey: string, req?: PayloadRequest): Promise<RoundFixture[]> {
  const { monday, sunday } = weekendBounds(weekendKey)
  const where: Where = { and: [{ status: { not_equals: 'removed' } }, { localDate: { greater_than_equal: monday } }, { localDate: { less_than_equal: sunday } }] }
  const res = await payload.find({ collection: 'selection-fixtures', where, limit: 500, pagination: false, depth: 0, overrideAccess: true, req, select: { gameId: true, localDate: true, startsAt: true, status: true } })
  return res.docs.map((d) => ({ gameId: String(d.gameId), localDate: String(d.localDate), startsAt: d.startsAt ? String(d.startsAt) : null, status: String(d.status) }))
}

export type RoundStateDoc = { id: number; locksAt?: string | null; lockOverride?: string | null; scoredManually?: boolean | null; scoredReason?: string | null }

export async function roundStateOf(payload: Payload, seasonId: number, weekendKey: string, req?: PayloadRequest): Promise<RoundStateDoc | null> {
  const res = await payload.find({ collection: 'fantasy-round-state', where: { and: [{ season: { equals: seasonId } }, { weekendKey: { equals: weekendKey } }] }, limit: 1, depth: 0, overrideAccess: true, req })
  return (res.docs[0] as unknown as RoundStateDoc | undefined) ?? null
}

/**
 * The current lock of a round, read only. Pass `req` from inside a hook so the reads use the hook's own database connection (a
 * second connection per hook can exhaust the pool when saves run in parallel). Sequential on purpose.
 */
export async function readLock(payload: Payload, seasonId: number, weekendKey: string, req?: PayloadRequest): Promise<{ lock: Date; stateId: number | null; stored: number | null }> {
  const fixtures = await liveFixturesOfWeekend(payload, weekendKey, req)
  const state = await roundStateOf(payload, seasonId, weekendKey, req)
  const lock = effectiveLock({ weekendKey, storedLocksAt: state?.locksAt, lockOverride: state?.lockOverride, fixtures })
  return { lock, stateId: state?.id ?? null, stored: state?.locksAt ? new Date(state.locksAt).getTime() : null }
}

/** The current lock of a round; also lowers the stored lock (creating the state row lazily) when it moved earlier. */
export async function currentLock(payload: Payload, seasonId: number, weekendKey: string): Promise<Date> {
  const { lock, stateId, stored } = await readLock(payload, seasonId, weekendKey)
  if (stored === null || lock.getTime() < stored) {
    const ctx = { disableRevalidate: true }
    if (stateId !== null) await payload.update({ collection: 'fantasy-round-state', id: stateId, data: { locksAt: lock.toISOString() }, overrideAccess: true, context: ctx })
    else await payload.create({ collection: 'fantasy-round-state', data: { season: seasonId, weekendKey, locksAt: lock.toISOString() }, overrideAccess: true, context: ctx })
  }
  return lock
}
