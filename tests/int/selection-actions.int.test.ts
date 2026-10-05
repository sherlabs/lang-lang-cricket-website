import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { availCookieName, linkToken } from '@/lib/availability-link'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { savePhone } from '@/lib/selector-profile-queries'
import { clearCollection, destroyTestPayload, getTestPayload, rest } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
const ctl = vi.hoisted(() => ({ headers: new Headers(), jar: new Map<string, string>() }))
vi.mock('next/headers', () => ({
  headers: async () => ctl.headers,
  cookies: async () => ({ get: (n: string) => (ctl.jar.has(n) ? { name: n, value: ctl.jar.get(n)! } : undefined), set: (n: string, v: string) => void ctl.jar.set(n, v) }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
}))
vi.mock('@/lib/selection-fixtures', async (orig) => ({ ...(await orig<typeof import('@/lib/selection-fixtures')>()), refreshSelectionFixtures: vi.fn(async () => ({ created: 0, updated: 0, moved: 0, removed: 0, kept: 0, skipped: 0 })) }))

const PASS = 'selection-pass-123'

/** The server actions are public POSTs: each must check who is calling itself (announce-teams spec 2, 4.5, 5.4). */
describe('selector and availability server actions', () => {
  let payload: Payload
  let selectorToken: string
  let selectorId: number
  let jo: { id: number }
  let sam: { id: number }
  let fixture: { id: number }
  const year = currentSeasonStartYear()

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const s = await payload.create({ collection: 'users', data: { email: 'selector@example.com', password: PASS, role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })
    selectorId = s.id
    selectorToken = (await rest('POST', '/users/login', { body: { email: 'selector@example.com', password: PASS } })).json.token
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    ctl.headers = new Headers()
    ctl.jar.clear()
    jo = await makePlayer(payload, 'Jo', 'Smith')
    sam = await makePlayer(payload, 'Sam', 'Jones')
    const squad = await makeSquad(payload, year)
    await addToSquad(payload, squad.id, jo.id)
    await addToSquad(payload, squad.id, sam.id)
    fixture = await makeFixture(payload)
    await savePhone({ id: selectorId, role: 'selector' } as never, jo.id, '0400 000 001')
  })

  const asSelector = () => {
    ctl.headers = new Headers({ Authorization: `JWT ${selectorToken}` })
  }

  it('every selector action refuses an unauthenticated caller (it redirects to the login page) and changes nothing', async () => {
    const actions = await import('@/app/(frontend)/selector/board-actions')
    const form = new FormData()
    form.set('playerId', String(jo.id))
    form.set('phone', '0411 111 111')
    form.set('pin', '999999')
    const calls: Array<() => Promise<unknown>> = [
      () => actions.setAnswerAction({ playerId: jo.id, fixtureId: fixture.id, status: 'in' }),
      () => actions.refreshFixturesAction({}),
      () => actions.rotateLinkAction(),
      () => actions.setLinkEnabledAction(form),
      () => actions.savePhoneAction({}, form),
      () => actions.setPinAction({}, form),
      () => actions.issueCodeAction({}, form),
      () => actions.saveFieldsAction({}, form),
      () => actions.addMembersAction({ squadId: 1, playerIds: [jo.id] }),
      () => actions.moveMemberAction({ fromSquadId: 1, toSquadId: 2, playerId: jo.id }),
      () => actions.removeMemberAction({ squadId: 1, playerId: jo.id }),
      () => actions.searchCandidatesAction({ squadId: 1, q: '', recency: 'all' }),
      () => actions.previewSeedAction(),
      () => actions.applySeedAction(),
    ]
    for (const call of calls) await expect(call()).rejects.toThrow(/NEXT_REDIRECT \/selector\/login/)
    expect((await payload.find({ collection: 'availability', overrideAccess: true })).totalDocs).toBe(0)
    expect((await getSettingsVersion())).toBe(1)
  })

  const getSettingsVersion = async () => Number(((await payload.findGlobal({ slug: 'selection-settings', overrideAccess: true })) as { linkVersion?: number }).linkVersion ?? 1)

  it('a signed-in selector can set an answer; the row names them, whatever else the call carries', async () => {
    asSelector()
    const actions = await import('@/app/(frontend)/selector/board-actions')
    const forged = { playerId: jo.id, fixtureId: fixture.id, status: 'in', setBy: 12345, source: 'player' } as never
    expect(await actions.setAnswerAction(forged)).toEqual({ ok: true })
    const row = (await payload.find({ collection: 'availability', overrideAccess: true, depth: 0 })).docs[0]
    expect(row).toMatchObject({ source: 'selector', setBy: selectorId })
    expect(await actions.setAnswerAction({ playerId: jo.id, fixtureId: fixture.id, status: 'banana' })).toEqual({ ok: false, error: 'Something went wrong. Please try again.' })
  })

  it('rotating the link works for a selector and bumps the version', async () => {
    asSelector()
    const actions = await import('@/app/(frontend)/selector/board-actions')
    await expect(actions.rotateLinkAction()).rejects.toThrow(/NEXT_REDIRECT \/selector\/link\?rotated=1/)
    expect(await getSettingsVersion()).toBe(2)
  })

  it('the player link: identify sets the signed cookie; a form-supplied player id is ignored; answers go to the cookie\'s player only', async () => {
    const actions = await import('@/app/(frontend)/availability/[token]/actions')
    const form = new FormData()
    form.set('token', linkToken(1))
    form.set('name', 'Jo Smith')
    form.set('pin', '0001')
    form.set('playerId', String(sam.id)) // ignored
    await expect(actions.identifyAction({}, form)).rejects.toThrow(/NEXT_REDIRECT \/availability\//)
    expect(ctl.jar.get(availCookieName())).toBeTruthy()
    const input = { token: linkToken(1), fixtureId: fixture.id, status: 'in', note: 'ready', playerId: sam.id } as never
    expect(await actions.answerAction(input)).toEqual({ ok: true })
    const rows = (await payload.find({ collection: 'availability', overrideAccess: true, depth: 0 })).docs
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ player: jo.id, source: 'player', setBy: null, note: 'ready' })
  })

  it('without the cookie, a wrong link or after rotation, answering is refused', async () => {
    const actions = await import('@/app/(frontend)/availability/[token]/actions')
    expect(await actions.answerAction({ token: linkToken(1), fixtureId: fixture.id, status: 'in', note: '' })).toMatchObject({ ok: false })
    const form = new FormData()
    form.set('token', linkToken(1))
    form.set('name', 'Jo Smith')
    form.set('pin', '0001')
    await expect(actions.identifyAction({}, form)).rejects.toThrow(/NEXT_REDIRECT/)
    await payload.updateGlobal({ slug: 'selection-settings', data: { linkVersion: 2 }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await actions.answerAction({ token: linkToken(1), fixtureId: fixture.id, status: 'in', note: '' })).toMatchObject({ ok: false })
    expect(await actions.answerAction({ token: linkToken(2), fixtureId: fixture.id, status: 'in', note: '' })).toMatchObject({ ok: false, message: 'Please type your name and PIN again.' })
    // A wrong token never identifies anyone and gives the same message as a wrong PIN.
    const bad = new FormData()
    bad.set('token', 'x'.repeat(43))
    bad.set('name', 'Jo Smith')
    bad.set('pin', '0001')
    expect(await actions.identifyAction({}, bad)).toEqual({ error: 'We could not match those details.' })
  })

  it('"Not you? Switch" clears the remembered device', async () => {
    const actions = await import('@/app/(frontend)/availability/[token]/actions')
    ctl.jar.set(availCookieName(), 'something')
    const form = new FormData()
    form.set('token', linkToken(1))
    await expect(actions.forgetAction(form)).rejects.toThrow(/NEXT_REDIRECT/)
    expect(ctl.jar.get(availCookieName())).toBe('')
  })
})
