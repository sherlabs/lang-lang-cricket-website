import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergePlayerInto, undoMerge } from '@/lib/players/merge-core'
import { writeBallot } from '@/lib/votes-queries'
import { destroyTestPayload, getTestPayload } from './helpers'
import { resetSelection } from './selection-helpers'
import { makeFinalGame, makeTeam, votesOn } from './votes-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

type Row = { fixture: number; voterKey: string; voter: number | null; picks: { place: number; player: number }[] }

/** The player merge keeps ballots honest (wave B spec 5.1): keys rewritten, same-game collisions keep the earlier ballot. */
describe('merging players with best-player ballots', () => {
  let payload: Payload
  let team: { id: number }[]
  let g1: { id: number }
  let g2: { id: number }

  const rows = async (): Promise<Row[]> =>
    (await payload.find({ collection: 'best-player-ballots', limit: 100, pagination: false, depth: 0, overrideAccess: true, sort: 'id' })).docs.map((b) => ({
      fixture: typeof b.fixture === 'number' ? b.fixture : (b.fixture as { id: number }).id,
      voterKey: b.voterKey,
      voter: (b.voter as number | null) ?? null,
      picks: (b.picks ?? []).map((p) => ({ place: p.place, player: p.player as number })).sort((a, b2) => a.place - b2.place),
    }))
  const ballot = (fixtureId: number, voterId: number, picks: number[], at: string) =>
    writeBallot(payload, { fixtureId, voterKey: `player:${voterId}`, voterPlayerId: voterId, picks: picks.map((p, i) => ({ place: i + 1, playerId: p })), source: 'voter', castBy: null, now: new Date(at) })
  const merge = (s: number, t: number) => mergePlayerInto(payload, { sourceId: s, targetId: t, userId: null })

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  afterAll(async () => {
    await resetSelection(payload)
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    team = await makeTeam(payload, 8)
    const ids = team.map((p) => p.id)
    g1 = await makeFinalGame(payload, ids, { daysAgo: 3 })
    g2 = await makeFinalGame(payload, ids, { daysAgo: 4 })
    await votesOn(payload)
  })

  it('moves ballots and picks with no collision, reports the counts, and undo puts them back', async () => {
    const [S, T, A, B, C] = team.map((p) => p.id)
    await ballot(g1.id, S, [A, B, C], '2026-10-01T00:00:00Z')
    await ballot(g2.id, S, [A, B, C], '2026-10-02T00:00:00Z')
    await ballot(g1.id, A, [S, B, C], '2026-10-01T01:00:00Z')
    const res = await merge(S, T)
    expect(res).toMatchObject({ ok: true, votes: { ballotsMoved: 2, collisionsDeleted: 0, picksDuplicatesDropped: 0, selfPicksDropped: 0, ballotsDeleted: 0 } })
    const after = await rows()
    expect(after.filter((r) => r.voter === T).map((r) => r.voterKey)).toEqual([`player:${T}`, `player:${T}`])
    expect(after.some((r) => r.voterKey === `player:${S}`)).toBe(false)
    expect(after.find((r) => r.voter === A)!.picks[0].player).toBe(T)
    if (res.ok) {
      const undone = await undoMerge(payload, res.logId, null)
      expect(undone.ok).toBe(true)
      const back = await rows()
      expect(back.filter((r) => r.voter === S)).toHaveLength(2)
      expect(back.find((r) => r.voter === A)!.picks[0].player).toBe(S)
    }
  })

  it('a same-game collision keeps the earlier ballot, whichever player it belonged to', async () => {
    const [S, T, A, B, C] = team.map((p) => p.id)
    await ballot(g1.id, S, [A, B, C], '2026-10-01T00:00:00Z') // earlier
    await ballot(g1.id, T, [B, A, C], '2026-10-01T05:00:00Z')
    expect(await merge(S, T)).toMatchObject({ ok: true, votes: { collisionsDeleted: 1, ballotsMoved: 1 } })
    let all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ voterKey: `player:${T}`, voter: T })
    expect(all[0].picks.map((p) => p.player)).toEqual([A, B, C])

    const [S2, T2, A2, B2, C2] = [team[5].id, team[6].id, A, B, C]
    await ballot(g2.id, S2, [A2, B2, C2], '2026-10-03T05:00:00Z')
    await ballot(g2.id, T2, [B2, A2, C2], '2026-10-03T00:00:00Z') // earlier
    expect(await merge(S2, T2)).toMatchObject({ ok: true, votes: { collisionsDeleted: 1, ballotsMoved: 0 } })
    all = (await rows()).filter((r) => r.fixture === g2.id)
    expect(all).toHaveLength(1)
    expect(all[0].picks.map((p) => p.player)).toEqual([B2, A2, C2])
  })

  it('a ballot that names both players keeps the better place', async () => {
    const [S, T, A, B] = team.map((p) => p.id)
    await ballot(g1.id, A, [S, B, T], '2026-10-01T00:00:00Z') // S first, T third
    await ballot(g2.id, A, [B, T, S], '2026-10-01T00:00:00Z') // T second, S third
    expect(await merge(S, T)).toMatchObject({ ok: true, votes: { picksDuplicatesDropped: 2 } })
    const all = await rows()
    expect(all.find((r) => r.fixture === g1.id)!.picks).toEqual([{ place: 1, player: T }, { place: 2, player: B }])
    expect(all.find((r) => r.fixture === g2.id)!.picks).toEqual([{ place: 1, player: B }, { place: 2, player: T }])
  })

  it('a merge that makes a self vote drops that pick, and the ballot when nothing is left', async () => {
    const [S, T, A, B] = team.map((p) => p.id)
    await ballot(g1.id, T, [S, A, B], '2026-10-01T00:00:00Z') // T voted for S: after the merge that is T for T
    await writeBallot(payload, { fixtureId: g2.id, voterKey: `player:${T}`, voterPlayerId: T, picks: [{ place: 1, playerId: S }], source: 'voter', castBy: null })
    expect(await merge(S, T)).toMatchObject({ ok: true, votes: { selfPicksDropped: 2, ballotsDeleted: 1 } })
    const all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0].picks.map((p) => p.player)).toEqual([A, B])
  })

  it('with self votes allowed the pick stays', async () => {
    await votesOn(payload, { allowSelfVote: true })
    const [S, T, A, B] = team.map((p) => p.id)
    await ballot(g1.id, T, [S, A, B], '2026-10-01T00:00:00Z')
    expect(await merge(S, T)).toMatchObject({ ok: true, votes: { selfPicksDropped: 0 } })
    expect((await rows())[0].picks[0].player).toBe(T)
  })

  it('the unique (game, voter) index is never violated and undo leaves a collision deletion in place', async () => {
    const [S, T, A, B, C] = team.map((p) => p.id)
    await ballot(g1.id, S, [A, B, C], '2026-10-01T00:00:00Z')
    await ballot(g1.id, T, [B, A, C], '2026-10-01T05:00:00Z')
    const res = await merge(S, T)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect((await undoMerge(payload, res.logId, null)).ok).toBe(true)
    // The kept ballot (earlier, S's) was moved to T and goes back to S; the deleted one is not restored.
    const back = await rows()
    expect(back).toHaveLength(1)
    expect(back[0].voterKey).toBe(`player:${S}`)
  })
})
