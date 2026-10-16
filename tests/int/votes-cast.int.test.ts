import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signAvailCookie } from '@/lib/availability-link'
import { identify } from '@/lib/availability-public'
import { LOCKED_MESSAGE } from '@/lib/availability-throttle'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { savePhone } from '@/lib/selector-profile-queries'
import { hit } from '@/lib/throttle'
import { castBallotFor, loadVoteView, ownBallot, votableGames, getVoteSettings } from '@/lib/votes-queries'
import { VOTES } from '@/config/site'
import { linkToken } from '@/lib/availability-link'
import { destroyTestPayload, getTestPayload } from './helpers'
import { ballotCount, cookieFor, makeFinalGame, makeTeam, settingsPatch, votesOn } from './votes-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
const jar = vi.hoisted(() => ({ cookie: undefined as string | undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (jar.cookie ? { value: jar.cookie } : undefined) }),
  headers: async () => new Headers(),
}))

const selector = { id: 1, role: 'selector' } as never
const TOKEN = linkToken(1)
const pick = (...ids: number[]) => (n: number) => ids.slice(0, n).map((playerId, i) => ({ place: i + 1, playerId }))

describe('casting a best-player ballot through the availability link', () => {
  let payload: Payload
  let team: { id: number; name: string }[]
  let game: { id: number }
  const cast = (voterId: number, readPicks: (n: number) => { place: number; playerId: number }[] | null, extra: Record<string, unknown> = {}) =>
    castBallotFor(payload, { token: TOKEN, cookie: cookieFor(voterId), fixtureId: game.id, readPicks, ip: null, ...extra })

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
    game = await makeFinalGame(payload, team.map((p) => p.id))
    await votesOn(payload)
    jar.cookie = undefined
  })

  it('votes are off until the committee switches them on: nothing is open and a cast is refused', async () => {
    await settingsPatch(payload, { enabled: false })
    expect(await votableGames(payload, team[0].id, await getVoteSettings(payload))).toEqual([])
    const res = await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))
    expect(res).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await ballotCount(payload)).toBe(0)
  })

  it('a player who identified with name and PIN votes, and their game is listed until they have voted', async () => {
    const sam = await makePlayer(payload, 'Sam', 'Jones')
    const squad = await makeSquad(payload, currentSeasonStartYear())
    await addToSquad(payload, squad.id, sam.id)
    await savePhone(selector, sam.id, '0400 000 002')
    const fresh = await makeFinalGame(payload, [sam.id, ...team.map((p) => p.id)])
    const who = await identify(payload, { linkVersion: 1, ip: null }, 'Sam Jones', '0002')
    expect(who).toEqual({ ok: true, playerId: sam.id })
    const cookie = signAvailCookie({ playerId: sam.id, linkVersion: 1, iat: Date.now() })
    const settings = await getVoteSettings(payload)
    const before = await votableGames(payload, sam.id, settings)
    expect(before.map((g) => [g.id, g.voted])).toEqual([[fresh.id, false]])
    const res = await castBallotFor(payload, { token: TOKEN, cookie, fixtureId: fresh.id, readPicks: pick(team[0].id, team[1].id, team[2].id), ip: null })
    expect(res).toEqual({ ok: true })
    expect((await votableGames(payload, sam.id, settings)).map((g) => g.voted)).toEqual([true])
  })

  it('a ballot is stored as places, the voter can see and change their own, and one row exists per voter and game', async () => {
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toEqual({ ok: true })
    const mine = await ownBallot(payload, game.id, team[0].id)
    expect(mine?.picks).toEqual([{ place: 1, playerId: team[1].id }, { place: 2, playerId: team[2].id }, { place: 3, playerId: team[3].id }])
    expect(await cast(team[0].id, pick(team[4].id, team[2].id, team[3].id))).toEqual({ ok: true })
    const changed = await ownBallot(payload, game.id, team[0].id)
    expect(changed?.picks[0]).toEqual({ place: 1, playerId: team[4].id })
    expect(changed?.revision).toBe(2)
    expect(changed?.editedAt).toBeTruthy()
    expect(await ballotCount(payload, game.id)).toBe(1)
  })

  it('editing is refused after the edit window, and after the voting window closes', async () => {
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toEqual({ ok: true })
    const later = new Date(Date.now() + 25 * 3_600_000)
    const res = await cast(team[0].id, pick(team[4].id, team[2].id, team[3].id), { now: later })
    expect(res).toMatchObject({ ok: false, code: 'closed' })
    expect((await ownBallot(payload, game.id, team[0].id))?.picks[0].playerId).toBe(team[1].id)
    const muchLater = new Date(Date.now() + 9 * 86_400_000)
    expect(await cast(team[5].id, pick(team[1].id, team[2].id, team[3].id), { now: muchLater })).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('10 parallel casts by one voter leave exactly one ballot', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await ballotCount(payload, game.id)).toBe(1)
  })

  it('refuses a player who was not in the game, a self vote, a non nominee, duplicates and missing places', async () => {
    const outsider = await makePlayer(payload, 'Out', 'Sider')
    expect(await cast(outsider.id, pick(team[1].id, team[2].id, team[3].id))).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await cast(team[0].id, pick(team[0].id, team[2].id, team[3].id))).toMatchObject({ ok: false, code: 'invalid', reason: 'self' })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, outsider.id))).toMatchObject({ ok: false, code: 'invalid', reason: 'not_nominee' })
    expect(await cast(team[0].id, pick(team[1].id, team[1].id, team[3].id))).toMatchObject({ ok: false, code: 'invalid', reason: 'duplicate' })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id))).toMatchObject({ ok: false, code: 'invalid', reason: 'missing' })
    expect(await cast(team[0].id, () => null)).toMatchObject({ ok: false, code: 'invalid' })
    expect(await ballotCount(payload)).toBe(0)
    // a tampered cookie player id cannot vote as someone else: the cookie is the only identity
    expect(await castBallotFor(payload, { token: TOKEN, cookie: 'x.y', fixtureId: game.id, readPicks: pick(team[1].id, team[2].id, team[3].id), ip: null })).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('self votes work when allowed', async () => {
    await settingsPatch(payload, { allowSelfVote: true })
    expect(await cast(team[0].id, pick(team[0].id, team[2].id, team[3].id))).toEqual({ ok: true })
  })

  it('a closed or excluded game cannot be voted on; a reopened one can', async () => {
    await payload.update({ collection: 'selection-fixtures', id: game.id, data: { votesState: 'closed' } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toMatchObject({ ok: false, code: 'unavailable' })
    await payload.update({ collection: 'selection-fixtures', id: game.id, data: { votesState: 'open', countsForAwards: false } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toMatchObject({ ok: false, code: 'unavailable' })
    await payload.update({ collection: 'selection-fixtures', id: game.id, data: { votesState: 'open', countsForAwards: true } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toEqual({ ok: true })
  })

  it('a rotated link ends remembered phones, and a hidden voter is not recognised', async () => {
    await payload.updateGlobal({ slug: 'selection-settings', data: { linkVersion: 2 }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await castBallotFor(payload, { token: linkToken(2), cookie: cookieFor(team[0].id, 1), fixtureId: game.id, readPicks: pick(team[1].id, team[2].id, team[3].id), ip: null })).toMatchObject({ ok: false })
    await payload.updateGlobal({ slug: 'selection-settings', data: { linkVersion: 1 }, overrideAccess: true, context: { disableRevalidate: true } })
    await payload.update({ collection: 'players', id: team[0].id, data: { hidden: true } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await cast(team[0].id, pick(team[1].id, team[2].id, team[3].id))).toMatchObject({ ok: false, code: 'unavailable' })
  })

  describe('throttling', () => {
    const lock = (key: string) => hit(payload, key, { limit: 0, windowMs: 3_600_000, lockMs: 900_000 })
    const attempt = (ip: string | null = null) => cast(team[0].id, pick(team[1].id, team[2].id, team[3].id), { ip })

    it('locks on the player key with the same message as availability', async () => {
      await lock(`votes:player:${team[0].id}`)
      expect(await attempt()).toEqual({ ok: false, code: 'locked', message: LOCKED_MESSAGE })
      expect(await cast(team[1].id, pick(team[2].id, team[3].id, team[4].id))).toEqual({ ok: true })
    })
    it('locks on the link key for everyone using the link', async () => {
      await lock('votes:link:1')
      expect(await cast(team[1].id, pick(team[2].id, team[3].id, team[4].id))).toMatchObject({ ok: false, code: 'locked' })
    })
    it('locks on the address key only for that address', async () => {
      await lock('votes:ip:9.9.9.9')
      expect(await attempt('9.9.9.9')).toMatchObject({ ok: false, code: 'locked' })
      expect(await attempt('8.8.8.8')).toEqual({ ok: true })
    })
    it('counts every cast: a player making too many tries is paused', async () => {
      let last: Awaited<ReturnType<typeof attempt>> = { ok: true }
      for (let i = 0; i < VOTES.perPlayerPerHour + 1; i++) last = await cast(team[0].id, pick(team[0].id, team[1].id, team[2].id))
      expect(last).toMatchObject({ ok: false, code: 'locked' })
    })
  })

  describe('the vote page is the same plain not-found for every failure, and identity comes first', () => {
    const ok = () => cookieFor(team[0].id)
    const view = (cookie: string | undefined, fixtureId: string | number = game.id, token = TOKEN) => loadVoteView(payload, { token, cookie, fixtureId: String(fixtureId) })

    it('loads for an identified player who was in the game', async () => {
      const v = await view(ok())
      expect(v).toMatchObject({ places: 3, values: [3, 2, 1], hasBallot: false, canEdit: true })
      expect(v!.options.map((o) => o.id)).not.toContain(team[0].id)
    })

    it('every failure returns the identical null', async () => {
      const outsider = await makePlayer(payload, 'Out', 'Sider')
      const closed = await makeFinalGame(payload, team.map((p) => p.id), { over: { votesState: 'closed' } })
      const upcoming = await makeFixture(payload)
      const cases: [string, Awaited<ReturnType<typeof view>>][] = [
        ['wrong link', await view(ok(), game.id, 'x'.repeat(43))],
        ['no cookie', await view(undefined)],
        ['tampered cookie', await view('a.b')],
        ['unknown game', await view(ok(), 99999)],
        ['nonsense id', await view(ok(), 'abc')],
        ['ineligible player', await view(cookieFor(outsider.id))],
        ['closed game', await view(ok(), closed.id)],
        ['game not final', await view(ok(), upcoming.id)],
      ]
      for (const [name, got] of cases) expect(got, name).toBeNull()
      await settingsPatch(payload, { enabled: false })
      expect(await view(ok()), 'votes off').toBeNull()
    })

    it('an unidentified request never looks up the requested game (its lookup is for a dummy id)', async () => {
      const spy = vi.spyOn(payload, 'find')
      for (const cookie of [undefined, 'a.b']) {
        spy.mockClear()
        await view(cookie, game.id)
        const asked = spy.mock.calls.filter(([a]) => (a as { collection: string }).collection === 'selection-fixtures').map(([a]) => JSON.stringify((a as { where: unknown }).where))
        expect(asked.length).toBe(1)
        expect(asked[0]).toBe('{"id":{"equals":-1}}')
      }
      spy.mockRestore()
    })

    it('the page renders the same not-found error for each failure and the form for a success', async () => {
      const { default: VotePage } = await import('@/app/(frontend)/availability/[token]/vote/[fixtureId]/page')
      const render = async (cookie: string | undefined, fixtureId: string, token = TOKEN) => {
        jar.cookie = cookie
        try {
          await VotePage({ params: Promise.resolve({ token, fixtureId }), searchParams: Promise.resolve({}) })
          return 'rendered'
        } catch (e) {
          return String((e as { digest?: string }).digest ?? e)
        }
      }
      const fails = [await render(undefined, String(game.id)), await render(ok(), '99999'), await render(ok(), String(game.id), 'x'.repeat(43)), await render('a.b', String(game.id))]
      expect(new Set(fails).size).toBe(1)
      expect(fails[0]).toContain('404')
      expect(await render(ok(), String(game.id))).toBe('rendered')
    })
  })
})
