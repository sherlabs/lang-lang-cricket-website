import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const ctl = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => ctl.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))

const PASS = 'selection-pass-123'

/** The team actions are public POSTs: each checks who is calling itself, and who did what is never read from the input. */
describe('team selection server actions', () => {
  let payload: Payload
  let token: string
  let selectorId: number
  let player: { id: number }
  const year = currentSeasonStartYear()

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    selectorId = (await payload.create({ collection: 'users', data: { email: 'selector@example.com', password: PASS, role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })).id
    token = (await rest('POST', '/users/login', { body: { email: 'selector@example.com', password: PASS } })).json.token
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    ctl.headers = new Headers()
    player = await makePlayer(payload, 'Jo', 'Smith')
    const squad = await makeSquad(payload, year)
    await addToSquad(payload, squad.id, player.id)
    await makeFixture(payload, { gameId: 'game-act' })
  })

  it('refuses an unauthenticated caller (redirects to the login page) and changes nothing', async () => {
    const actions = await import('@/app/(frontend)/selector/team-actions')
    const calls: Array<() => Promise<unknown>> = [
      () => actions.saveTeamAction({ gameId: 'game-act', expectedRevision: 0, size: 11, markedReady: false, slots: [{ playerId: player.id }] }),
      () => actions.publishTeamsAction({ gameIds: ['game-act'], announce: true, acknowledged: true }),
      () => actions.withdrawTeamAction({ gameId: 'game-act' }),
    ]
    for (const call of calls) await expect(call()).rejects.toThrow(/NEXT_REDIRECT \/selector\/login/)
    expect((await payload.count({ collection: 'team-sheets', overrideAccess: true })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'announcements', where: { autoKey: { like: 'teams:' } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('a signed-in selector can save and publish; a forged identity in the input is ignored; junk input is refused', async () => {
    ctl.headers = new Headers({ Authorization: `JWT ${token}` })
    const actions = await import('@/app/(frontend)/selector/team-actions')
    const saved = await actions.saveTeamAction({ gameId: 'game-act', expectedRevision: 0, size: 11, markedReady: false, slots: [{ playerId: player.id, isCaptain: true, updatedBy: 99999 } as never] })
    expect(saved).toEqual({ ok: true, revision: 1 })
    const row = (await payload.find({ collection: 'team-sheets', overrideAccess: true, depth: 0, pagination: false })).docs[0]
    expect(row.updatedBy).toBe(selectorId)
    expect((await actions.saveTeamAction({ gameId: '../../x', expectedRevision: 0, size: 11, markedReady: false, slots: [] })).ok).toBe(false)
    expect((await actions.saveTeamAction({ gameId: 'game-act', expectedRevision: 1, size: 11, markedReady: false, slots: 'nope' as never })).ok).toBe(false)
    expect((await actions.publishTeamsAction({ gameIds: [], announce: true, acknowledged: true })).ok).toBe(false)
    const published = await actions.publishTeamsAction({ gameIds: ['game-act'], announce: true, acknowledged: true, publishedBy: 12345 } as never)
    expect(published.ok).toBe(true)
    const after = (await payload.find({ collection: 'team-sheets', overrideAccess: true, depth: 0, pagination: false })).docs[0]
    expect(after.publishedBy).toBe(selectorId)
    expect((await actions.withdrawTeamAction({ gameId: 'game-act' })).ok).toBe(true)
  })
})
