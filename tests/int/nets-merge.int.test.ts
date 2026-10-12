import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergePlayerInto, undoMerge } from '@/lib/players/merge-core'
import { clubToday } from '@/lib/selection-fixtures'
import { destroyTestPayload, getTestPayload } from './helpers'
import { makePlayer, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

type Row = { session: number; playerKey: string; player: number | null }

/** The player merge keeps net check-ins honest (wave B spec 5.1): keys rewritten, same-session collisions keep the earlier check-in. */
describe('merging players with net attendance', () => {
  let payload: Payload
  let S: number
  let T: number
  let O: number
  let s1: number
  let s2: number

  const rows = async (): Promise<Row[]> =>
    (await payload.find({ collection: 'net-attendance', limit: 100, pagination: false, depth: 0, overrideAccess: true, sort: 'id' })).docs.map((r) => ({ session: r.session as number, playerKey: r.playerKey, player: (r.player as number | null) ?? null }))
  const checkIn = (session: number, player: number, at: string) =>
    payload.create({ collection: 'net-attendance', data: { session, playerKey: `player:${player}`, player, checkedInAt: at } as never, overrideAccess: true, context: { disableRevalidate: true } })
  const makeSession = async () => (await payload.create({ collection: 'net-sessions', data: { title: 'Nets', date: clubToday(), state: 'finished' } as never, overrideAccess: true, context: { disableRevalidate: true } })).id

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  afterAll(async () => {
    await resetSelection(payload)
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    S = (await makePlayer(payload, 'Source', 'Person')).id
    T = (await makePlayer(payload, 'Target', 'Person')).id
    O = (await makePlayer(payload, 'Other', 'Person')).id
    s1 = await makeSession()
    s2 = await makeSession()
  })

  it('moves check-ins with no collision, reports the counts, and undo puts them back', async () => {
    await checkIn(s1, S, '2026-10-01T10:00:00Z')
    await checkIn(s2, S, '2026-10-02T10:00:00Z')
    await checkIn(s1, O, '2026-10-01T10:05:00Z')
    const res = await mergePlayerInto(payload, { sourceId: S, targetId: T, userId: null })
    expect(res).toMatchObject({ ok: true, nets: { attendanceMoved: 2, collisionsDeleted: 0 } })
    const after = await rows()
    expect(after.filter((r) => r.player === T).map((r) => r.playerKey)).toEqual([`player:${T}`, `player:${T}`])
    expect(after.some((r) => r.playerKey === `player:${S}`)).toBe(false)
    expect(after.find((r) => r.player === O)!.playerKey).toBe(`player:${O}`)
    if (!res.ok) return
    expect((await undoMerge(payload, res.logId, null)).ok).toBe(true)
    const back = await rows()
    expect(back.filter((r) => r.player === S).map((r) => r.playerKey)).toEqual([`player:${S}`, `player:${S}`])
    expect(back.filter((r) => r.player === T)).toHaveLength(0)
  })

  it('a same-session collision keeps the earlier check-in, whichever player it belonged to', async () => {
    await checkIn(s1, S, '2026-10-01T10:00:00Z') // earlier
    await checkIn(s1, T, '2026-10-01T10:30:00Z')
    expect(await mergePlayerInto(payload, { sourceId: S, targetId: T, userId: null })).toMatchObject({ ok: true, nets: { attendanceMoved: 1, collisionsDeleted: 1 } })
    let all = await rows()
    expect(all).toEqual([{ session: s1, playerKey: `player:${T}`, player: T }])
    const kept = (await payload.find({ collection: 'net-attendance', overrideAccess: true, depth: 0 })).docs[0]
    expect(new Date(kept.checkedInAt as string).toISOString()).toBe('2026-10-01T10:00:00.000Z')

    const S2 = (await makePlayer(payload, 'Second', 'Source')).id
    await checkIn(s2, S2, '2026-10-03T10:30:00Z')
    await checkIn(s2, T, '2026-10-03T10:00:00Z') // earlier: the target's stays
    expect(await mergePlayerInto(payload, { sourceId: S2, targetId: T, userId: null })).toMatchObject({ ok: true, nets: { attendanceMoved: 0, collisionsDeleted: 1 } })
    all = await rows()
    expect(all).toHaveLength(2)
  })

  it('a merge with no net data reports zeros and the unique index is never violated', async () => {
    expect(await mergePlayerInto(payload, { sourceId: S, targetId: T, userId: null })).toMatchObject({ ok: true, nets: { attendanceMoved: 0, collisionsDeleted: 0 } })
    await checkIn(s1, O, '2026-10-01T10:00:00Z')
    await expect(checkIn(s1, O, '2026-10-01T10:00:01Z')).rejects.toThrow()
  })

  it('undo does not move a check-in that has changed since', async () => {
    await checkIn(s1, S, '2026-10-01T10:00:00Z')
    const res = await mergePlayerInto(payload, { sourceId: S, targetId: T, userId: null })
    if (!res.ok) throw new Error('merge failed')
    const row = (await payload.find({ collection: 'net-attendance', overrideAccess: true, depth: 0 })).docs[0]
    await payload.update({ collection: 'net-attendance', id: row.id, data: { playerKey: `player:${O}`, player: O } as never, overrideAccess: true, context: { disableRevalidate: true } })
    await undoMerge(payload, res.logId, null)
    expect((await rows())[0]).toMatchObject({ playerKey: `player:${O}`, player: O })
  })
})
