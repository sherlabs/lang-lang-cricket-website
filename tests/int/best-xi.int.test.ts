/**
 * best-xi.int (wave E, WP-2): the suggester against a seeded squad. The expected XI comes out of stored games and availability, a
 * hidden or out-of-pool player is never suggested or echoed, "Use this XI" writes a draft through the revision-checked save path and
 * leaves a published team's public snapshot alone, the admin-set rules change the result, and the page and action are selector-only.
 */
import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { buildSnapshot } from '@/lib/selection/team-sheet'
import { applySuggestion, loadSuggestion, parseIdList } from '@/lib/selector-xi-queries'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { addToSquad, isoDate, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const CTX = { disableRevalidate: true } as const
const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const nav = vi.hoisted(() => ({ headers: new Headers(), push: vi.fn(), refresh: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => nav.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }))
// The sticky bar is a client component; keep the real redirect and notFound, give it a router.
vi.mock('next/navigation', async (orig) => ({ ...(await orig<typeof import('next/navigation')>()), useRouter: () => ({ push: nav.push, refresh: nav.refresh }) }))

let payload: Payload
let user: { id: number; role: 'selector'; collection: 'users'; email: string }
const u = () => user as never
const year = currentSeasonStartYear()
const text = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const signIn = async (role: 'selector' | 'editor' | 'admin' | null) => {
  nav.headers = new Headers(role ? { authorization: `JWT ${await tokenFor(payload, role)}` } : {})
}

type World = { fixtureId: number; squadId: number; byName: Map<string, number>; hiddenId: number; outsiderId: number }
let w: World

async function profile(player: number, data: Record<string, unknown>) {
  await payload.create({ collection: 'player-selection-profiles', data: { player, ...data } as never, overrideAccess: true, context: CTX })
}

/** B Grade squad of 14 (+1 hidden, +1 out of squad), three finished games with positions, runs and spells for most. */
async function seedWorld(): Promise<World> {
  const fixture = await makeFixture(payload, { gameId: 'game-xi', gradeId: 'grade-b', gradeName: 'B Grade', localDate: isoDate(5) })
  const squad = await makeSquad(payload, year, 'grade-b', 'B Grade')
  const byName = new Map<string, number>()
  const make = async (first: string, extra: Record<string, unknown> = {}) => {
    const p = await makePlayer(payload, first, 'Test', extra)
    await addToSquad(payload, squad.id, p.id)
    byName.set(`${first} Test`, p.id)
    return p.id
  }
  const kev = await make('Kev')
  await profile(kev, { role: 'keeper', canKeep: true })
  const bowlers: number[] = []
  for (const n of ['Bowa', 'Bowb', 'Bowc', 'Bowd', 'Bowe', 'Bowf']) {
    const id = await make(n)
    bowlers.push(id)
    await profile(id, { role: 'bowler' })
  }
  const batters: number[] = []
  for (const n of ['Bata', 'Batb', 'Batc', 'Batd', 'Bate', 'Batf']) {
    const id = await make(n)
    batters.push(id)
    await profile(id, { role: 'batter' })
  }
  const away = await make('Away')
  await make('Newbie')
  const hidden = await make('Hidden', { hidden: true })
  const outsider = await makePlayer(payload, 'Outsider', 'Test') // not in this grade's squad
  byName.set('Outsider Test', outsider.id)

  // Availability: Away is out, Batf maybe, Newbie has not answered, everyone else is in (Hidden says in too, and still must not show).
  const answers: [number, string][] = [[kev, 'in'], ...bowlers.map((b): [number, string] => [b, 'in']), ...batters.map((b, i): [number, string] => [b, i === 5 ? 'maybe' : 'in']), [away, 'out'], [hidden, 'in']]
  for (const [player, status] of answers) await payload.create({ collection: 'availability', data: { player, fixture: fixture.id, status } as never, overrideAccess: true, context: CTX })

  // Another grade the same day: the outsider and Bate are already picked in it (so Bate is excluded as "Already in A Grade").
  const otherFixture = await makeFixture(payload, { gameId: 'game-xi-a', gradeId: 'grade-a', gradeName: 'A Grade', localDate: isoDate(5) })
  await payload.create({ collection: 'team-sheets', data: { fixture: otherFixture.id, size: 11, revision: 1, slots: [{ player: batters[4], order: 1, isCaptain: false, isKeeper: false }, { player: outsider.id, order: 2, isCaptain: false, isKeeper: false }] } as never, overrideAccess: true, context: CTX })

  // Three finished games in the last three weeks. Batting positions follow the list order; bowlers have spells.
  const lineup = [batters[0], batters[1], kev, batters[2], batters[3], batters[4], batters[5], ...bowlers]
  for (let k = 0; k < 3; k++) {
    const match = await payload.create({ collection: 'matches', data: { gameId: `xi-match-${k}`, status: 'FINAL', gradeId: 'grade-b', gradeName: 'B Grade', localDate: isoDate(-7 * (k + 1)), opponentName: 'Example Rovers', isHome: true, source: 'import', importBatch: 'xi-test' } as never, overrideAccess: true, context: CTX })
    const innings = await payload.create({ collection: 'match-innings', data: { match: match.id, sequenceNo: 1, isClubBatting: true, played: true } as never, overrideAccess: true, context: CTX })
    for (const [i, playerId] of lineup.entries()) {
      const key = `a${i + 1}`
      await payload.create({ collection: 'match-appearances', data: { match: match.id, appearanceId: key, isClubSide: true, player: playerId, isFillIn: false, isRegisteredPlayer: true } as never, overrideAccess: true, context: CTX })
      await payload.create({ collection: 'match-batting', data: { match: match.id, innings: innings.id, appearanceId: key, position: i + 1, battingStatus: 'out', runs: 10 + i + k } as never, overrideAccess: true, context: CTX })
      if (i >= 7) await payload.create({ collection: 'match-bowling', data: { match: match.id, innings: innings.id, appearanceId: key, order: i - 6, balls: 36, runs: 20 + i, wickets: (i + k) % 3 } as never, overrideAccess: true, context: CTX })
    }
  }
  return { fixtureId: fixture.id, squadId: squad.id, byName, hiddenId: hidden, outsiderId: outsider.id }
}

beforeAll(async () => {
  payload = await getTestPayload()
  await clearCollection(payload, 'users')
  const row = await payload.create({ collection: 'users', data: { email: 'selector@example.com', password: 'selector-pass-123', role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })
  user = { id: row.id, role: 'selector', collection: 'users', email: row.email }
}, 60_000)
afterAll(async () => {
  await resetSelection(payload)
  await clearCollection(payload, 'users')
  await destroyTestPayload(payload)
})
beforeEach(async () => {
  await resetSelection(payload)
  nav.push.mockClear()
  nav.refresh.mockClear()
  cache.revalidateTag.mockClear()
  cache.revalidatePath.mockClear()
  w = await seedWorld()
}, 60_000)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  nav.headers = new Headers()
})

const id = (name: string) => w.byName.get(name)!
const pickNames = (v: NonNullable<Awaited<ReturnType<typeof loadSuggestion>>>) => v.result.picks.map((p) => p.name)

describe('the proposal', () => {
  it('fills the keeper, bowling options and batters from stored games, and explains every pick', async () => {
    const v = (await loadSuggestion(u(), 'game-xi'))!
    expect(v.result.picks).toHaveLength(11)
    const names = pickNames(v)
    expect(names).toContain('Kev Test')
    expect(v.result.keeperId).toBe(id('Kev Test'))
    expect(v.result.picks.find((p) => p.isKeeper)!.name).toBe('Kev Test')
    expect(v.result.picks.filter((p) => p.role === 'bowler').length).toBeGreaterThanOrEqual(5)
    expect(v.result.picks.filter((p) => p.need === 'bowler')).toHaveLength(5)
    for (const p of v.result.picks) expect(p.reason.length).toBeGreaterThan(20)
    const bowa = v.result.picks.find((p) => p.name === 'Bowa Test')!
    expect(bowa.reason).toMatch(/Last 3 spells: \d\/\d+/)
    expect(v.rules).toMatchObject({ minBowlers: 5, minBatters: 5, requireKeeper: true })
  })

  it('leaves out the player who is out, the one already picked in another grade, and a hidden player, with reasons', async () => {
    const v = (await loadSuggestion(u(), 'game-xi'))!
    const reasons = Object.fromEntries(v.result.excluded.map((x) => [x.name, x.reason]))
    expect(reasons['Away Test']).toMatch(/^Out\./)
    expect(reasons['Bate Test']).toBe('Already in A Grade.')
    expect(pickNames(v)).not.toContain('Away Test')
    expect(pickNames(v)).not.toContain('Bate Test')
    const everyone = JSON.stringify(v)
    expect(everyone).not.toContain('Hidden Test')
    expect(everyone).not.toContain('Outsider Test')
  })

  it('orders the batting from median stored positions (three innings each) and flags the rest', async () => {
    const v = (await loadSuggestion(u(), 'game-xi'))!
    const ordered = v.result.picks.filter((p) => p.orderSuggested)
    expect(ordered.length).toBeGreaterThan(5)
    expect(ordered.map((p) => p.medianPosition)).toEqual([...ordered.map((p) => p.medianPosition)].sort((a, b) => a! - b!))
    expect(v.result.picks[0].name).toBe('Bata Test')
    expect(v.result.picks.filter((p) => !p.orderSuggested).every((p) => p.order > ordered.length)).toBe(true)
    const newbie = v.result.picks.concat().find((p) => p.name === 'Newbie Test')
    if (newbie) expect(newbie.reason).toContain('No batting data')
  })

  it('applies pins and leave-outs; a pin on the player who is out is allowed and warns', async () => {
    const away = id('Away Test')
    const v = (await loadSuggestion(u(), 'game-xi', { pin: String(away), leave: String(id('Bata Test')) }))!
    expect(pickNames(v)).toContain('Away Test')
    expect(pickNames(v)).not.toContain('Bata Test')
    expect(v.result.picks.find((p) => p.name === 'Away Test')!.reason).toMatch(/^Pinned by you\./)
    expect(v.warnings.some((x) => x.code === 'player-out')).toBe(true)
    expect(v.result.excluded.find((x) => x.name === 'Bata Test')!.reason).toBe('Left out by you.')
  })

  it('ignores pins, leaves and a keeper that are not in the grade pool, and never echoes them', async () => {
    const base = (await loadSuggestion(u(), 'game-xi'))!
    const crafted = (await loadSuggestion(u(), 'game-xi', { pin: [String(w.hiddenId), String(w.outsiderId), '999999', 'abc', '1e3'], leave: `${w.hiddenId},${w.outsiderId}`, keeper: String(w.hiddenId) }))!
    expect(crafted.result).toEqual(base.result)
    expect(crafted.state).toEqual({ pins: [], leaves: [], keeperId: null })
    expect(JSON.stringify(crafted)).not.toContain('Hidden Test')
  })

  it('a changed rule changes the result', async () => {
    const before = (await loadSuggestion(u(), 'game-xi'))!
    const bowlersOf = (v: typeof before) => v.result.picks.filter((p) => p.role === 'bowler').length
    await payload.updateGlobal({ slug: 'selection-settings', data: { xi: { minBowlers: 0, minBatters: 11, requireKeeper: true, treatNoAnswerAsMaybe: true } } as never, overrideAccess: true, context: CTX })
    const after = (await loadSuggestion(u(), 'game-xi'))!
    expect(after.rules.minBatters).toBe(11)
    expect(pickNames(after)).not.toEqual(pickNames(before))
    expect(bowlersOf(after)).toBeLessThan(bowlersOf(before))
  })

  it('no answer is left out when the setting is off, and the newbie then needs a pin', async () => {
    await payload.updateGlobal({ slug: 'selection-settings', data: { xi: { minBowlers: 5, minBatters: 5, requireKeeper: true, treatNoAnswerAsMaybe: false } } as never, overrideAccess: true, context: CTX })
    const v = (await loadSuggestion(u(), 'game-xi'))!
    expect(pickNames(v)).not.toContain('Newbie Test')
    expect(v.result.excluded.find((x) => x.name === 'Newbie Test')!.code).toBe('no-answer')
  })

  it('shows the difference from the saved team', async () => {
    const first = (await loadSuggestion(u(), 'game-xi'))!
    expect(first.savedCount).toBe(0)
    expect(first.changes).toEqual([])
    await applySuggestion(u(), { gameId: 'game-xi', expectedRevision: 0, playerIds: [id('Kev Test'), id('Bata Test')], keeperId: null, captainId: null })
    const again = (await loadSuggestion(u(), 'game-xi'))!
    expect(again.savedCount).toBe(2)
    expect(again.revision).toBe(1)
    expect(again.changes.length).toBeGreaterThan(5)
    expect(again.changes.some((c) => /is in$/.test(c))).toBe(true)
  })

  it('makes no network call', async () => {
    const f = vi.fn(() => { throw new Error('network call in the suggester') })
    vi.stubGlobal('fetch', f)
    await loadSuggestion(u(), 'game-xi')
    expect(f).not.toHaveBeenCalled()
  })

  it('an unknown game is null', async () => {
    expect(await loadSuggestion(u(), 'nope')).toBeNull()
    expect(await loadSuggestion(u(), 'x'.repeat(200))).toBeNull()
  })
})

describe('use this XI', () => {
  // showHiddenFields: the snapshot columns are hidden fields, and a read without it would make the "unchanged" checks vacuous.
  const sheet = async () => (await payload.find({ collection: 'team-sheets', where: { fixture: { equals: w.fixtureId } }, limit: 1, depth: 0, showHiddenFields: true, overrideAccess: true })).docs[0]

  it('writes a draft in the suggested order with the keeper tag, and does not publish, announce or mark ready', async () => {
    const v = (await loadSuggestion(u(), 'game-xi'))!
    const res = await applySuggestion(u(), { gameId: 'game-xi', expectedRevision: v.revision, playerIds: v.result.picks.map((p) => p.id), keeperId: v.result.keeperId, captainId: null })
    expect(res).toEqual({ ok: true, revision: 1 })
    const row = (await sheet())!
    expect(row.slots?.map((s) => (typeof s.player === 'object' ? s.player!.id : s.player))).toEqual(v.result.picks.map((p) => p.id))
    expect(row.slots?.filter((s) => s.isKeeper)).toHaveLength(1)
    expect(row.publishedAt ?? null).toBeNull()
    expect(row.publishedSnapshot ?? null).toBeNull()
    expect(row.markedReady).toBe(false)
    expect((await payload.count({ collection: 'announcements', where: { autoKey: { like: 'teams:' } } as never, overrideAccess: true })).totalDocs).toBe(0)
    expect(cache.revalidateTag).not.toHaveBeenCalled()
  })

  it('refuses a stale revision and changes nothing', async () => {
    const v = (await loadSuggestion(u(), 'game-xi'))!
    const ids = v.result.picks.map((p) => p.id)
    expect((await applySuggestion(u(), { gameId: 'game-xi', expectedRevision: 0, playerIds: ids, keeperId: null, captainId: null })).ok).toBe(true)
    const stale = await applySuggestion(u(), { gameId: 'game-xi', expectedRevision: 0, playerIds: ids.slice(0, 3), keeperId: null, captainId: null })
    expect(stale).toMatchObject({ ok: false, stale: true })
    expect((await sheet())!.slots).toHaveLength(11)
  })

  it('refuses a player outside the grade pool, a hidden player, a duplicate and an empty list', async () => {
    const ok = [id('Kev Test')]
    for (const bad of [[...ok, w.outsiderId], [...ok, w.hiddenId], [id('Kev Test'), id('Kev Test')], [], [...ok, 0.5], Array.from({ length: 14 }, (_, i) => i + 1)]) {
      expect((await applySuggestion(u(), { gameId: 'game-xi', expectedRevision: 0, playerIds: bad as number[], keeperId: null, captainId: null })).ok, JSON.stringify(bad)).toBe(false)
    }
    expect(await sheet()).toBeUndefined()
  })

  it('a team already published keeps its public snapshot, publishedAt and count', async () => {
    const publishedAt = new Date(Date.now() - 3_600_000).toISOString()
    const slots = [id('Kev Test'), id('Bata Test'), id('Batb Test')].map((player, i) => ({ player, order: i + 1, isCaptain: i === 1, isKeeper: i === 0 }))
    const snapshot = buildSnapshot({ slots: slots.map((s) => ({ ...s })), size: 11, revision: 1 }, publishedAt)
    await payload.create({ collection: 'team-sheets', data: { fixture: w.fixtureId, size: 11, revision: 1, slots, publishedAt, publishCount: 1, publishedSnapshot: snapshot } as never, overrideAccess: true, context: CTX })
    const before = (await sheet())!
    const v = (await loadSuggestion(u(), 'game-xi'))!
    expect(v.published).toBe(true)
    expect(v.captainId).toBe(id('Bata Test'))
    const res = await applySuggestion(u(), { gameId: 'game-xi', expectedRevision: v.revision, playerIds: v.result.picks.map((p) => p.id), keeperId: v.result.keeperId, captainId: v.captainId })
    expect(res).toEqual({ ok: true, revision: 2 })
    const after = (await sheet())!
    expect(after.slots).toHaveLength(11)
    expect(after.publishedSnapshot).toEqual(before.publishedSnapshot)
    expect(before.publishedSnapshot).toEqual(snapshot)
    expect(after.publishedSnapshot).toEqual(snapshot)
    expect(after.publishedAt).toBe(before.publishedAt)
    expect(after.publishCount).toBe(1)
    expect((await payload.count({ collection: 'announcements', where: { autoKey: { like: 'teams:' } } as never, overrideAccess: true })).totalDocs).toBe(0)
  })
})

describe('access', () => {
  it('every exported function refuses anyone who is not admin, editor or selector', async () => {
    for (const who of [null, undefined, { id: 1, role: 'nobody', collection: 'users' }, { id: 2, collection: 'users' }]) {
      await expect(loadSuggestion(who as never, 'game-xi')).rejects.toThrow(/Selector access/)
      await expect(applySuggestion(who as never, { gameId: 'game-xi', expectedRevision: 0, playerIds: [1], keeperId: null, captainId: null })).rejects.toThrow(/Selector access/)
    }
  })

  it('lets a selector, an editor and an admin load the proposal', async () => {
    for (const role of ['selector', 'editor', 'admin']) expect(await loadSuggestion({ id: 1, role, collection: 'users' } as never, 'game-xi')).toMatchObject({ size: 11 })
  })

  it('the server action redirects a signed-out caller and writes nothing', async () => {
    nav.headers = new Headers()
    const { applySuggestedXiAction } = await import('@/app/(frontend)/selector/suggest-actions')
    const err = await applySuggestedXiAction({ gameId: 'game-xi', expectedRevision: 0, playerIds: [id('Kev Test')], keeperId: null, captainId: null }).catch((e) => e as { digest?: string })
    expect((err as { digest?: string }).digest).toMatch(/^NEXT_REDIRECT/)
    expect((await payload.find({ collection: 'team-sheets', where: { fixture: { equals: w.fixtureId } }, overrideAccess: true })).docs).toHaveLength(0)
  })

  it('the server action saves a draft for a signed-in selector and ignores forged fields', async () => {
    await signIn('selector')
    const { applySuggestedXiAction } = await import('@/app/(frontend)/selector/suggest-actions')
    const input = { gameId: 'game-xi', expectedRevision: 0, playerIds: [id('Kev Test'), id('Bata Test')], keeperId: id('Kev Test'), captainId: null, updatedBy: 99999, publish: true, publishedAt: '2000-01-01' }
    expect(await applySuggestedXiAction(input as never)).toMatchObject({ ok: true })
    const row = (await payload.find({ collection: 'team-sheets', where: { fixture: { equals: w.fixtureId } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    expect(row.updatedBy).not.toBe(99999)
    expect(row.publishedAt ?? null).toBeNull()
    expect(await applySuggestedXiAction({ gameId: 'game-xi', expectedRevision: 1, playerIds: ['1; DROP' as never], keeperId: null, captainId: null })).toMatchObject({ ok: false })
  })

  it('an editor cannot change the rules over REST, an admin can, and a selector can read them', async () => {
    const sel = await tokenFor(payload, 'selector')
    const ed = await tokenFor(payload, 'editor')
    const admin = await tokenFor(payload, 'admin')
    const body = { xi: { minBowlers: 3 } }
    expect((await rest('POST', '/globals/selection-settings', { body, token: sel })).status).toBe(403)
    expect((await rest('POST', '/globals/selection-settings', { body, token: ed })).status).toBe(403)
    expect((await rest('POST', '/globals/selection-settings', { body, token: admin })).status).toBe(200)
    expect((await loadSuggestion(u(), 'game-xi'))!.rules.minBowlers).toBe(3)
    expect((await rest('GET', '/globals/selection-settings', { token: sel })).status).toBe(200)
    expect((await rest('GET', '/globals/selection-settings')).status).toBeOneOf([401, 403])
  })

  it('availability, squads and team sheets stay unreadable to a selector over REST', async () => {
    const sel = await tokenFor(payload, 'selector')
    for (const c of ['availability', 'squad-members', 'team-sheets']) expect((await rest('GET', `/${c}?limit=1`, { token: sel })).status, c).toBeOneOf([401, 403])
  })
})

describe('the page', () => {
  const run = async (fn: () => unknown) => {
    try {
      await fn()
      return null
    } catch (e) {
      return e as { digest?: string }
    }
  }
  const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))

  it('redirects a signed-out visitor to the selector login', async () => {
    await signIn(null)
    const page = await import('@/app/(frontend)/selector/(area)/teams/[gameId]/suggest/page')
    const e = await run(() => page.default({ params: Promise.resolve({ gameId: 'game-xi' }), searchParams: Promise.resolve({}) }))
    expect(e?.digest).toMatch(/^NEXT_REDIRECT/)
    expect(e?.digest).toContain('/selector/login')
  })

  it('renders for selector, editor and admin, and is 404 for an unknown game', async () => {
    const page = await import('@/app/(frontend)/selector/(area)/teams/[gameId]/suggest/page')
    for (const role of ['selector', 'editor', 'admin'] as const) {
      await signIn(role)
      const html = text(renderToStaticMarkup((await page.default({ params: Promise.resolve({ gameId: 'game-xi' }), searchParams: Promise.resolve({}) })) as React.ReactElement))
      expect(html, role).toContain('Suggested team')
      expect(html, role).toContain('Use this XI')
      expect(html, role).toContain('Kev Test')
    }
    await signIn('selector')
    const e = await run(() => page.default({ params: Promise.resolve({ gameId: 'nope' }), searchParams: Promise.resolve({}) }))
    expect(e?.digest).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/)
  })

  it('never renders a hidden player or an id that is not in the pool, even when the address carries one', async () => {
    await signIn('selector')
    const page = await import('@/app/(frontend)/selector/(area)/teams/[gameId]/suggest/page')
    const markup = renderToStaticMarkup((await page.default({ params: Promise.resolve({ gameId: 'game-xi' }), searchParams: Promise.resolve({ pin: `${w.hiddenId},${w.outsiderId},${id('Bowa Test')}`, leave: String(w.hiddenId), keeper: String(w.outsiderId) }) })) as React.ReactElement)
    expect(markup).not.toContain('Hidden Test')
    expect(markup).not.toContain('Outsider Test')
    const lists = hrefs(markup).filter((h) => h.includes('/suggest')).flatMap((h) => [...new URLSearchParams(h.split('?')[1] ?? '').values()].flatMap((v) => v.split(',')))
    expect(lists).not.toContain(String(w.hiddenId))
    expect(lists).not.toContain(String(w.outsiderId))
    expect(lists).toContain(String(id('Bowa Test'))) // the valid pin is kept
  })

  it('the builder links to it, and the page says nothing is published', async () => {
    await signIn('selector')
    const builder = await import('@/app/(frontend)/selector/(area)/teams/[gameId]/page')
    const html = renderToStaticMarkup((await builder.default({ params: Promise.resolve({ gameId: 'game-xi' }) })) as React.ReactElement)
    expect(html).toContain('/selector/teams/game-xi/suggest')
    const page = await import('@/app/(frontend)/selector/(area)/teams/[gameId]/suggest/page')
    const sug = text(renderToStaticMarkup((await page.default({ params: Promise.resolve({ gameId: 'game-xi' }), searchParams: Promise.resolve({}) })) as React.ReactElement))
    expect(sug).toContain('Nothing is published')
  })
})

describe('the id list parser', () => {
  it('keeps unique positive integers, from commas and repeats, and drops everything else', () => {
    expect(parseIdList('1,2,2,x,-3,0,07,1e3, 9 ')).toEqual([1, 2, 7, 9])
    expect(parseIdList(['4', '5,6'])).toEqual([4, 5, 6])
    expect(parseIdList(undefined)).toEqual([])
    expect(parseIdList('1234567890123')).toEqual([])
    expect(parseIdList(Array.from({ length: 80 }, (_, i) => String(i + 1)).join(',')).length).toBe(30)
  })
})
