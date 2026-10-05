import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { signAvailCookie, linkToken } from '@/lib/availability-link'
import { globalKey, GLOBAL_RULE, LOCKED_MESSAGE, NO_MATCH_MESSAGE } from '@/lib/availability-throttle'
import { identify, playerView, rememberedPlayer, resolveLink, respond } from '@/lib/availability-public'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { getSelectionSettings } from '@/lib/selection/store'
import { savePhone, setManualPin, issueOneTimeCode } from '@/lib/selector-profile-queries'
import { hit, ipHit } from '@/lib/throttle'
import { destroyTestPayload, getTestPayload } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)

const selector = { id: 1, role: 'selector' } as never

/**
 * The availability link, end to end against real Postgres (announce-teams spec 4.4, 4.5, 4.9): link rotation, name plus PIN,
 * lockouts that cannot be dodged by parallel attempts or by unknown names, and the bypasses for the legitimate (a remembered phone,
 * a selector's one-time code).
 */
describe('availability link', () => {
  let payload: Payload
  let jo: { id: number }
  let sam: { id: number }
  let fixtureB: { id: number }
  let fixtureA: { id: number }

  beforeAll(async () => {
    payload = await getTestPayload()
  })
  afterAll(async () => {
    await resetSelection(payload)
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    jo = await makePlayer(payload, 'Jo', 'Smith')
    sam = await makePlayer(payload, 'Sam', 'Jones')
    const squad = await makeSquad(payload, currentSeasonStartYear())
    await addToSquad(payload, squad.id, jo.id)
    await addToSquad(payload, squad.id, sam.id)
    fixtureB = await makeFixture(payload)
    fixtureA = await makeFixture(payload, { gradeId: 'grade-a', gradeName: 'A Grade' })
    await savePhone(selector, jo.id, '0400 000 001') // PIN 0001
    await savePhone(selector, sam.id, '0400 000 002') // PIN 0002
  })

  const ctx = { linkVersion: 1, ip: null }

  it('only the live, switched-on link resolves; a rotated or switched-off link is the same plain "not found"', async () => {
    const settings = await getSelectionSettings(payload)
    expect(settings).toMatchObject({ linkEnabled: true, linkVersion: 1, availabilityLockHours: 0 })
    expect(await resolveLink(payload, linkToken(1))).not.toBeNull()
    expect(await resolveLink(payload, 'x'.repeat(43))).toBeNull()
    await payload.updateGlobal({ slug: 'selection-settings', data: { linkVersion: 2 }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await resolveLink(payload, linkToken(1))).toBeNull()
    expect(await resolveLink(payload, linkToken(2))).not.toBeNull()
    await payload.updateGlobal({ slug: 'selection-settings', data: { linkEnabled: false }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await resolveLink(payload, linkToken(2))).toBeNull()
  })

  it('identifies by name and PIN (last four of the phone), and the cookie dies when the link is rotated', async () => {
    const res = await identify(payload, ctx, 'jo SMITH', '0001')
    expect(res).toEqual({ ok: true, playerId: jo.id })
    const settings = await getSelectionSettings(payload)
    const cookie = signAvailCookie({ playerId: jo.id, linkVersion: 1, iat: Date.now() })
    expect((await rememberedPlayer(payload, cookie, settings))?.id).toBe(jo.id)
    await payload.updateGlobal({ slug: 'selection-settings', data: { linkVersion: 2 }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await rememberedPlayer(payload, cookie, await getSelectionSettings(payload))).toBeNull()
    expect(await rememberedPlayer(payload, 'garbage', settings)).toBeNull()
  })

  it('wrong name, wrong PIN, no PIN set and a manual 6-digit PIN all behave', async () => {
    const wrongPin = await identify(payload, ctx, 'Jo Smith', '9999')
    const wrongName = await identify(payload, ctx, 'Nobody Here', '0001')
    expect(wrongPin).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
    expect(wrongName).toEqual(wrongPin)
    const noPin = await makePlayer(payload, 'Pat', 'Lee')
    const squads = await payload.find({ collection: 'squads', limit: 1, overrideAccess: true })
    await addToSquad(payload, squads.docs[0].id, noPin.id)
    expect(await identify(payload, ctx, 'Pat Lee', '0000')).toEqual(wrongPin)
    expect((await setManualPin(selector, noPin.id, '123456')).ok).toBe(true)
    expect(await identify(payload, ctx, 'Pat Lee', '123456')).toEqual({ ok: true, playerId: noPin.id })
    expect((await setManualPin(selector, noPin.id, '12')).ok).toBe(false)
  })

  it('five wrong PINs lock a real name: the right PIN is then refused, a remembered phone and a one-time code still work', async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await identify(payload, ctx, 'Jo Smith', `100${i}`))
    expect(results.slice(0, 4).every((r) => !r.ok && r.message === NO_MATCH_MESSAGE)).toBe(true)
    expect(results[4]).toEqual({ ok: false, message: LOCKED_MESSAGE })
    expect(await identify(payload, ctx, 'Jo Smith', '0001')).toEqual({ ok: false, message: LOCKED_MESSAGE })
    // Another player is not affected by Jo's lock.
    expect(await identify(payload, ctx, 'Sam Jones', '0002')).toEqual({ ok: true, playerId: sam.id })
    // A remembered phone never goes through identification, so it is never locked out.
    const settings = await getSelectionSettings(payload)
    const cookie = signAvailCookie({ playerId: jo.id, linkVersion: 1, iat: Date.now() })
    expect((await rememberedPlayer(payload, cookie, settings))?.id).toBe(jo.id)
    // A selector's one-time code gets Jo in without the PIN, once.
    const code = await issueOneTimeCode(selector, jo.id)
    expect(await identify(payload, ctx, 'Jo Smith', code)).toEqual({ ok: true, playerId: jo.id })
    expect(await identify(payload, ctx, 'Jo Smith', code)).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
  })

  it('an expired one-time code is refused', async () => {
    const code = await issueOneTimeCode(selector, sam.id)
    await payload.db.drizzle.execute(sql.raw(`UPDATE "payload"."player_selection_profiles" SET otc_expires_at = now() - interval '1 hour'`))
    expect(await identify(payload, ctx, 'Sam Jones', code)).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
  })

  it('a name that matches nobody locks the same way and returns the same bodies; random names share 64 buckets', async () => {
    const results = []
    for (let i = 0; i < 5; i++) results.push(await identify(payload, ctx, 'Nobody Here', `100${i}`))
    expect(results[4]).toEqual({ ok: false, message: LOCKED_MESSAGE })
    expect(results.slice(0, 4).every((r) => !r.ok && r.message === NO_MATCH_MESSAGE)).toBe(true)
    const count = async () => Number(((await payload.db.drizzle.execute(sql.raw('SELECT count(*)::int AS n FROM "payload"."throttle_hits"'))).rows[0] as { n: number }).n)
    const before = await count()
    await Promise.all(Array.from({ length: 150 }, (_, i) => identify(payload, ctx, `Random Person ${i}`, '4444')))
    const grown = (await count()) - before
    expect(grown).toBeLessThanOrEqual(64)
  })

  it('parallel attempts cannot beat the limit: at most four wrong answers get through before the lock', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => identify(payload, ctx, 'Jo Smith', `20${String(i).padStart(2, '0')}`)))
    expect(results.filter((r) => !r.ok && r.message === NO_MATCH_MESSAGE).length).toBeLessThanOrEqual(4)
    expect(await identify(payload, ctx, 'Jo Smith', '0001')).toEqual({ ok: false, message: LOCKED_MESSAGE })
  })

  it('a correct PIN hidden in a parallel burst is refused once the limit is spent', async () => {
    const guesses = Array.from({ length: 40 }, (_, i) => (i === 20 ? '0001' : `30${String(i).padStart(2, '0')}`))
    const results = await Promise.all(guesses.map((g) => identify(payload, ctx, 'Jo Smith', g)))
    // At most four guesses (right or wrong) are ever checked; the other thirty-six are refused as locked.
    expect(results.filter((r) => r.ok || r.message === NO_MATCH_MESSAGE).length).toBeLessThanOrEqual(4)
    expect(await identify(payload, ctx, 'Jo Smith', '0001')).toEqual({ ok: false, message: LOCKED_MESSAGE })
  })

  it('wrong one-time codes are counted and finally locked, while the right code still needs no PIN lock to be clear', async () => {
    const results = []
    for (let i = 0; i < 25; i++) results.push(await identify(payload, ctx, 'Jo Smith', `wrongcd${String.fromCharCode(97 + (i % 26))}`))
    expect(results.slice(0, 19).every((r) => !r.ok && r.message === NO_MATCH_MESSAGE)).toBe(true)
    expect(results[24]).toEqual({ ok: false, message: LOCKED_MESSAGE })
  })

  it('the whole-link pause blocks new identification but not a remembered phone, and a one-time code still works', async () => {
    await hit(payload, globalKey(1), { ...GLOBAL_RULE, limit: 0 }) // trips at once
    expect(await identify(payload, ctx, 'Jo Smith', '0001')).toEqual({ ok: false, message: LOCKED_MESSAGE })
    const settings = await getSelectionSettings(payload)
    expect((await rememberedPlayer(payload, signAvailCookie({ playerId: jo.id, linkVersion: 1, iat: Date.now() }), settings))?.id).toBe(jo.id)
    const code = await issueOneTimeCode(selector, jo.id)
    expect(await identify(payload, ctx, 'Jo Smith', code)).toEqual({ ok: true, playerId: jo.id })
  })

  it('lock doubling stops at the one-hour cap', async () => {
    const rule = { limit: 1, windowMs: 60_000, lockMs: 900_000 }
    await hit(payload, 'cap', rule)
    await hit(payload, 'cap', rule)
    await payload.db.drizzle.execute(sql.raw(`UPDATE "payload"."throttle_hits" SET strikes = 30, locked_until = NULL, count = 1, window_start = now()`))
    const tripped = await hit(payload, 'cap', rule)
    expect(tripped.allowed).toBe(false)
    expect(tripped.retryAfterSeconds).toBeLessThanOrEqual(3600)
    expect(tripped.retryAfterSeconds).toBeGreaterThan(3000)
  })

  it('an address limit applies only when there is a trusted address', async () => {
    for (let i = 0; i < 70; i++) expect((await ipHit(payload, 'avail', null)).allowed).toBe(true)
    const results = []
    for (let i = 0; i < 62; i++) results.push((await ipHit(payload, 'avail', '203.0.113.9')).allowed)
    expect(results.slice(0, 60).every(Boolean)).toBe(true)
    expect(results[60]).toBe(false)
    expect(await identify(payload, { linkVersion: 1, ip: '203.0.113.9' }, 'Jo Smith', '0001')).toEqual({ ok: false, message: LOCKED_MESSAGE })
  })

  it('two players of one name with the same PIN: refused, and both are flagged for a manual PIN', async () => {
    const twin = await makePlayer(payload, 'Jo', 'Smith', { slug: 'jo-smith-2' })
    const squad = (await payload.find({ collection: 'squads', limit: 1, overrideAccess: true })).docs[0]
    await addToSquad(payload, squad.id, twin.id)
    await savePhone(selector, twin.id, '0411 110 001') // also ends in 0001
    expect(await identify(payload, ctx, 'Jo Smith', '0001')).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
    const flagged = await payload.find({ collection: 'player-selection-profiles', where: { needsManualPin: { equals: true } }, overrideAccess: true, pagination: false })
    expect(flagged.docs).toHaveLength(2)
    // A manual PIN for one of them settles it.
    await setManualPin(selector, twin.id, '654321')
    expect(await identify(payload, ctx, 'Jo Smith', '654321')).toEqual({ ok: true, playerId: twin.id })
    expect(await identify(payload, ctx, 'Jo Smith', '0001')).toEqual({ ok: true, playerId: jo.id })
  })

  it('a name that matches more than five players is refused', async () => {
    const squad = (await payload.find({ collection: 'squads', limit: 1, overrideAccess: true })).docs[0]
    for (let i = 0; i < 6; i++) {
      const p = await makePlayer(payload, 'Alex', 'Same', { slug: `alex-same-${i}` })
      await addToSquad(payload, squad.id, p.id)
      await savePhone(selector, p.id, `0422 000 00${i}`)
    }
    expect(await identify(payload, ctx, 'Alex Same', '0000')).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
  })

  it('the player sees only their own answers and their own grade, and a tampered playerId cannot write for someone else', async () => {
    const settings = await getSelectionSettings(payload)
    const view = await playerView(payload, jo.id, settings)
    expect(view?.fixtures.map((f) => f.id)).toEqual([fixtureB.id])
    expect(JSON.stringify(view)).not.toMatch(/0400|Sam|Jones|phone|pin/i)
    expect(await respond(payload, jo.id, { fixtureId: fixtureB.id, status: 'in', note: ' keen\n\tas  ' }, settings)).toEqual({ ok: true })
    // The other grade's game is refused.
    expect((await respond(payload, jo.id, { fixtureId: fixtureA.id, status: 'in' }, settings)).ok).toBe(false)
    expect((await respond(payload, jo.id, { fixtureId: fixtureB.id, status: 'banana' }, settings)).ok).toBe(false)
    const rows = (await payload.find({ collection: 'availability', overrideAccess: true, depth: 0, pagination: false })).docs
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ player: jo.id, fixture: fixtureB.id, status: 'in', source: 'player', note: 'keen as' })
    // Replacing an answer updates the same row.
    await respond(payload, jo.id, { fixtureId: fixtureB.id, status: 'out' }, settings)
    const again = (await payload.find({ collection: 'availability', overrideAccess: true, depth: 0, pagination: false })).docs
    expect(again).toHaveLength(1)
    expect(again[0].status).toBe('out')
    // Sam never answered: Jo's answer is not visible in Sam's view.
    expect((await playerView(payload, sam.id, settings))?.fixtures[0].answer).toBe('none')
  })

  it('changes close the configured number of hours before the game', async () => {
    await payload.updateGlobal({ slug: 'selection-settings', data: { availabilityLockHours: 24 * 30 }, overrideAccess: true, context: { disableRevalidate: true } })
    const settings = await getSelectionSettings(payload)
    const view = await playerView(payload, jo.id, settings)
    expect(view?.fixtures[0].closed).toBe(true)
    expect(await respond(payload, jo.id, { fixtureId: fixtureB.id, status: 'in' }, settings)).toEqual({ ok: false, message: 'Selection has started; call a selector.' })
  })

  it('a player in no squad sees no games and cannot answer', async () => {
    const outsider = await makePlayer(payload, 'Lone', 'Wolf')
    const settings = await getSelectionSettings(payload)
    expect((await playerView(payload, outsider.id, settings))?.inSquad).toBe(false)
    expect((await respond(payload, outsider.id, { fixtureId: fixtureB.id, status: 'in' }, settings)).ok).toBe(false)
  })
})
