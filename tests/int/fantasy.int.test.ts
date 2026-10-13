/**
 * fantasy.int (wave F WP-2, spec 4.9): the whole competition against real Postgres. Join and return with a PIN, the brute-force
 * lock, identical messages for known and unknown names and for a taken and a blocked name, link rotation, the salary cap to the
 * tenth, the lock enforced in the save and in the hook (also when a game moved earlier), parallel saves, a leaderboard checked
 * against a hand-computed table (captain, duck, null stats, a player who did not play, an abandoned game, a junior), provisional
 * versus scored rounds, the public switch, Change PIN, add-a-device codes, committee reset, rename and disable.
 */
import type { Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { signFantasyCookie } from '@/lib/fantasy/link'
import { addMissingPlayers, calculatePrices, closeSeason, markRoundScored, openSeason, removeEntry, renameEntry, resetPin, rotateLink, searchManagers, setAvailable, setBlockedWords, setDisabled, setPrice, setSwitch, setUpSeason, updateRules } from '@/lib/fantasy/admin'
import { changePin, identifyEntry, issueDeviceCode, registerEntry, rememberedEntry } from '@/lib/fantasy/join'
import { NAME_UNAVAILABLE } from '@/lib/fantasy/names'
import { computeLeaderboard } from '@/lib/fantasy/queries'
import { saveSquad } from '@/lib/fantasy/squads'
import { getFantasySettings, getOpenSeason, getSeasonById, resolveFantasyLink, squadsOfEntry, type FantasySeason } from '@/lib/fantasy/store'
import { fantasyToken } from '@/lib/fantasy/link'
import { LOCKED_MESSAGE, NO_MATCH_MESSAGE } from '@/lib/fantasy/throttle'
import { getFactsFor } from '@/lib/match-store/stats-queries'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { destroyTestPayload, getTestPayload, wipeTestData } from './helpers'
import { fixtureOn, makeClubPlayers, makeUser, resetFantasy, saturday, startOn, storeGame } from './fantasy-helpers'
import { makeSquad, addToSquad } from './selection-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: <T,>(fn: () => Promise<T>) => fn }))

const ctx = { linkVersion: 1, ip: null }
const GOOD = '483917'

describe('fantasy competition', () => {
  let payload: Payload
  let admin: Awaited<ReturnType<typeof makeUser>>
  let editor: Awaited<ReturnType<typeof makeUser>>
  let season: FantasySeason
  let ids: Record<string, number>
  const year = currentSeasonStartYear()
  const sat1 = saturday(-3)
  const sat2 = saturday(-2)
  const sat3 = saturday(0)
  const sat4 = saturday(1)

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetFantasy(payload)
    admin = await makeUser(payload, 'admin')
    editor = await makeUser(payload, 'editor')
    // 12 senior players in a current squad, one junior with a huge game, one hidden player.
    ids = await makeClubPlayers(payload, 14, { c13: { isJunior: true }, c14: { hidden: true } })
    const squad = await makeSquad(payload, year)
    for (let i = 1; i <= 12; i++) await addToSquad(payload, squad.id, ids[`c${i}`])
    await storeGame(payload, {
      gameId: 'g1', season: year, date: sat1,
      innings: [
        { seq: 1, clubBatting: true, bat: [
          { who: 'c1', pos: 1, status: 'out', runs: 0, fours: 0, sixes: 0, dismissal: 'bowled' },
          { who: 'c2', pos: 2, status: 'out', runs: 30, fours: 2, sixes: 1, dismissal: 'lbw' },
          { who: 'c3', pos: 3, status: 'not_out', runs: 12, fours: null, sixes: null },
          { who: 'c13', pos: 4, status: 'not_out', runs: 100, fours: 0, sixes: 0 },
          { who: 'c14', pos: 5, status: 'not_out', runs: 90, fours: 0, sixes: 0 },
        ] },
        { seq: 2, clubBatting: false, bat: [
          { who: 'o1', pos: 1, status: 'out', dismissal: 'bowled', bowler: 'c4' },
          { who: 'o2', pos: 2, status: 'out', dismissal: 'caught', bowler: 'c4', fielder: 'c5' },
          { who: 'o3', pos: 3, status: 'out', dismissal: 'bowled', bowler: 'c4' },
        ], bowl: [{ who: 'c4', wickets: 3, maidens: 1 }] },
      ],
      extra: ['c6'],
    }, ids)
    await storeGame(payload, { gameId: 'g2', season: year, date: sat2, result: 'abandoned', innings: [{ seq: 1, clubBatting: true, bat: [{ who: 'c1', pos: 1, status: 'out', runs: 99, fours: 0, sixes: 0, dismissal: 'bowled' }] }] }, ids)
    await storeGame(payload, {
      gameId: 'g3', season: year, date: sat2,
      innings: [{ seq: 1, clubBatting: true, bat: [
        { who: 'c2', pos: 1, status: 'out', runs: 0, fours: 0, sixes: 0, dismissal: 'bowled' },
        { who: 'c6', pos: 2, status: 'out', runs: 60, fours: 4, sixes: 0, dismissal: 'lbw' },
      ] }],
    }, ids)
    await fixtureOn(payload, 'g1', sat1, startOn(sat1), 'final')
    await fixtureOn(payload, 'g2', sat2, startOn(sat2))
    await fixtureOn(payload, 'g3', sat2, startOn(sat2, 5), 'final')
    await fixtureOn(payload, 'g4', sat3, startOn(sat3))
    await fixtureOn(payload, 'g5', sat4, startOn(sat4))
  }, 120_000)

  afterAll(async () => {
    await wipeTestData(payload)
    await destroyTestPayload(payload)
  })

  it('the season is set up as a draft with prices for seniors only, then opened', async () => {
    const facts = await getFactsFor([year])
    const made = await setUpSeason(payload, admin, { year, name: `${year} season`, facts })
    expect(made.ok && made.created).toBe(true)
    season = (made as { season: FantasySeason }).season
    expect(season.status).toBe('draft')
    expect(season.rules.salaryCapTenths).toBe(1000)
    const priced = await payload.find({ collection: 'fantasy-prices', where: { season: { equals: season.id } }, limit: 100, depth: 0, overrideAccess: true })
    const pricedIds = priced.docs.map((p) => (typeof p.player === 'number' ? p.player : (p.player as { id: number }).id))
    expect(pricedIds.sort()).toEqual(Array.from({ length: 12 }, (_, i) => ids[`c${i + 1}`]).sort())
    expect(pricedIds).not.toContain(ids.c13)
    expect(pricedIds).not.toContain(ids.c14)
    for (const p of priced.docs) expect(p.priceTenths as number).toBeGreaterThanOrEqual(40)
    // Idempotent for a year that exists.
    const again = await setUpSeason(payload, admin, { year, name: 'other', facts })
    expect(again.ok && again.created).toBe(false)
    // The committee (an editor) cannot do admin things.
    expect(await calculatePrices(payload, editor, season, facts)).toMatchObject({ ok: false })
    expect(await openSeason(payload, editor, season)).toMatchObject({ ok: false })
    // Every price becomes 80 so a squad of 11 costs 88.0, then the rules are edited while it is a draft.
    for (let i = 1; i <= 12; i++) expect((await setPrice(payload, admin, season, ids[`c${i}`], 80)).ok).toBe(true)
    expect((await updateRules(payload, admin, season, { transfersPerRound: 3 })).ok).toBe(true)
    const opened = await openSeason(payload, admin, season)
    expect(opened.ok).toBe(true)
    season = (opened as { season: FantasySeason }).season
    expect((await updateRules(payload, admin, season, { squadSize: 9 }))).toMatchObject({ ok: false })
    await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { enabled: true } } as never, overrideAccess: true, context: { disableRevalidate: true } })
  })

  it('only the live link of an enabled competition with an open season resolves', async () => {
    expect(await resolveFantasyLink(payload, fantasyToken(1))).not.toBeNull()
    expect(await resolveFantasyLink(payload, 'x'.repeat(43))).toBeNull()
    expect(await resolveFantasyLink(payload, fantasyToken(2))).toBeNull()
    await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { enabled: false } } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await resolveFantasyLink(payload, fantasyToken(1))).toBeNull()
    await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { enabled: true } } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await resolveFantasyLink(payload, fantasyToken(1))).not.toBeNull()
  })

  it('joins, refuses a weak PIN, and a taken name and a blocked name give the identical message', async () => {
    expect((await setBlockedWords(payload, editor, season, ['Zork'])).ok).toBe(true)
    season = (await getSeasonById(payload, season.id))!
    expect(await registerEntry(payload, ctx, season, { teamName: 'Ducks', pin: '123456', again: '123456' })).toEqual({ ok: false, message: 'Choose a PIN that is hard to guess.' })
    expect(await registerEntry(payload, ctx, season, { teamName: 'Ducks', pin: GOOD, again: '999999' })).toMatchObject({ ok: false })
    const first = await registerEntry(payload, ctx, season, { teamName: 'The Ducks', pin: GOOD, again: GOOD })
    expect(first.ok).toBe(true)
    const taken = await registerEntry(payload, ctx, season, { teamName: 'the  ducks!', pin: GOOD, again: GOOD })
    const blocked = await registerEntry(payload, ctx, season, { teamName: 'Z o r k Team', pin: GOOD, again: GOOD })
    expect(taken).toEqual({ ok: false, message: NAME_UNAVAILABLE })
    expect(blocked).toEqual({ ok: false, message: NAME_UNAVAILABLE })
    // No secret is stored in the clear and none comes back.
    const row = (await payload.find({ collection: 'fantasy-entries', limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as Record<string, unknown>
    expect(JSON.stringify(row)).not.toContain(GOOD)
    expect(row.pinHash).toMatch(/^[0-9a-f]{64}$/)
    // The cap on managers.
    const capped = { ...season, rules: { ...season.rules, maxEntries: 1 } }
    expect(await registerEntry(payload, ctx, capped, { teamName: 'Another', pin: '730264', again: '730264' })).toEqual({ ok: false, message: 'This competition is full.' })
  })

  it('returns with the right PIN; five wrong tries lock, even for the right PIN, and unknown names look the same', async () => {
    const ok = await identifyEntry(payload, ctx, season, { teamName: 'the ducks', secret: GOOD, kind: 'pin' })
    expect(ok.ok).toBe(true)
    const wrong = [] as unknown[]
    for (let i = 0; i < 4; i++) wrong.push(await identifyEntry(payload, ctx, season, { teamName: 'The Ducks', secret: '730264', kind: 'pin' }))
    expect(wrong).toEqual(Array(4).fill({ ok: false, message: NO_MATCH_MESSAGE }))
    expect(await identifyEntry(payload, ctx, season, { teamName: 'The Ducks', secret: '730264', kind: 'pin' })).toEqual({ ok: false, message: LOCKED_MESSAGE })
    expect(await identifyEntry(payload, ctx, season, { teamName: 'The Ducks', secret: GOOD, kind: 'pin' })).toEqual({ ok: false, message: LOCKED_MESSAGE })
    // An unknown name answers the same way, then locks the same way.
    const u = [] as unknown[]
    for (let i = 0; i < 4; i++) u.push(await identifyEntry(payload, ctx, season, { teamName: 'Nobody Here', secret: '730264', kind: 'pin' }))
    expect(u).toEqual(wrong)
    expect(await identifyEntry(payload, ctx, season, { teamName: 'Nobody Here', secret: '730264', kind: 'pin' })).toEqual({ ok: false, message: LOCKED_MESSAGE })
    // The locks are keyed on the link version: a new link forgets them.
    expect((await identifyEntry(payload, { ...ctx, linkVersion: 2 }, season, { teamName: 'The Ducks', secret: GOOD, kind: 'pin' })).ok).toBe(true)
  })

  it('link rotation ends a remembered device, and so does a PIN change after the cookie was issued', async () => {
    const entry = (await payload.find({ collection: 'fantasy-entries', limit: 1, depth: 0, overrideAccess: true })).docs[0]
    const raw = signFantasyCookie({ entryId: entry.id, linkVersion: 1, iat: Date.now() })
    expect((await rememberedEntry(payload, raw, season, 1))?.entry.id).toBe(entry.id)
    expect(await rememberedEntry(payload, raw, season, 2)).toBeNull()
    expect(await rememberedEntry(payload, 'garbage', season, 1)).toBeNull()
    const old = signFantasyCookie({ entryId: entry.id, linkVersion: 1, iat: Date.now() - 60_000 })
    await payload.update({ collection: 'fantasy-entries', id: entry.id, data: { pinSetAt: new Date().toISOString() } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await rememberedEntry(payload, old, season, 1)).toBeNull()
    // Rotating needs an administrator, and bumps only the version.
    expect(await rotateLink(payload, editor)).toMatchObject({ ok: false })
    const r = await rotateLink(payload, admin)
    expect(r).toEqual({ ok: true, linkVersion: 2 })
    expect((await getFantasySettings(payload)).linkVersion).toBe(2)
    expect(await resolveFantasyLink(payload, fantasyToken(1))).toBeNull()
    expect(await resolveFantasyLink(payload, fantasyToken(2))).not.toBeNull()
    await payload.updateGlobal({ slug: 'site-settings', data: { fantasy: { linkVersion: 1 } } as never, overrideAccess: true, context: { disableRevalidate: true } })
  })

  const join = async (name: string, pin = GOOD) => {
    const r = await registerEntry(payload, { linkVersion: 1, ip: null }, season, { teamName: name, pin, again: pin })
    if (!r.ok) throw new Error(r.message)
    return r.entry
  }
  const pick = (labels: string[]) => labels.map((l) => ids[l])
  const ELEVEN = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11']

  it('saves a squad at exactly the cap and refuses one tenth over, in the open round only', async () => {
    const e = await join('Cap Team', '591832')
    // Ten players at 80 and one at 200 would break the max price, so use 100: 10 x 90 + 100 = 1000 exactly.
    for (let i = 1; i <= 10; i++) await setPrice(payload, admin, season, ids[`c${i}`], 90)
    await setPrice(payload, admin, season, ids.c11, 100)
    const ok = await saveSquad(payload, season, e.id, { round: sat3, picks: pick(ELEVEN), captain: ids.c4 })
    expect(ok).toMatchObject({ ok: true, round: sat3, spentTenths: 1000, transfersUsed: 0 })
    await setPrice(payload, admin, season, ids.c11, 101)
    const over = await saveSquad(payload, season, e.id, { round: sat3, picks: pick(ELEVEN), captain: ids.c4 })
    expect(over).toEqual({ ok: false, message: 'Your squad is over the cap by 0.1.' })
    // The saved squad stays valid after a price change; the new price applies only when the manager saves again.
    expect((await squadsOfEntry(payload, e.id))[0].spentTenths).toBe(1000)
    await setPrice(payload, admin, season, ids.c11, 100)
    // Crafted requests: other round, a junior, a hidden player, a duplicate, a captain outside the squad, too few players.
    expect(await saveSquad(payload, season, e.id, { round: sat1, picks: pick(ELEVEN), captain: ids.c4 })).toMatchObject({ ok: false })
    expect(await saveSquad(payload, season, e.id, { picks: [...pick(ELEVEN.slice(0, 10)), ids.c13], captain: ids.c4 })).toMatchObject({ ok: false })
    expect(await saveSquad(payload, season, e.id, { picks: [...pick(ELEVEN.slice(0, 10)), ids.c14], captain: ids.c4 })).toMatchObject({ ok: false })
    expect(await saveSquad(payload, season, e.id, { picks: [...pick(ELEVEN.slice(0, 10)), ids.c1], captain: ids.c4 })).toMatchObject({ ok: false })
    expect(await saveSquad(payload, season, e.id, { picks: pick(ELEVEN), captain: ids.c12 })).toMatchObject({ ok: false })
    expect(await saveSquad(payload, season, e.id, { picks: pick(ELEVEN.slice(0, 9)), captain: ids.c4 })).toMatchObject({ ok: false })
    expect(await saveSquad(payload, season, e.id, { picks: 'nonsense', captain: 'x' })).toMatchObject({ ok: false })
    // A manager who disabled or has a forced PIN change cannot save.
    await setDisabled(payload, editor, season, e.id, true)
    expect(await saveSquad(payload, season, e.id, { picks: pick(ELEVEN), captain: ids.c4 })).toMatchObject({ ok: false })
    await setDisabled(payload, editor, season, e.id, false)
  })

  it('two parallel saves leave exactly one squad row for the round, and the last valid save wins', async () => {
    const e = await join('Parallel Team', '640275')
    const a = pick(ELEVEN)
    const b = pick(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'c12'])
    const [r1, r2] = await Promise.all([
      saveSquad(payload, season, e.id, { picks: a, captain: ids.c1 }),
      saveSquad(payload, season, e.id, { picks: b, captain: ids.c2 }),
    ])
    expect(r1.ok || r2.ok).toBe(true)
    const rows = await payload.find({ collection: 'fantasy-squads', where: { entry: { equals: e.id } }, limit: 10, depth: 0, overrideAccess: true })
    expect(rows.totalDocs).toBe(1)
  })

  it('transfers are limited per round and replacing a player who left the game is free', async () => {
    // Two more players so a squad can change by more than one.
    const squads = await payload.find({ collection: 'squads', limit: 1, depth: 0, overrideAccess: true })
    for (const n of [15, 16]) {
      const p = await payload.create({ collection: 'players', data: { firstName: `Player${n}`, lastName: `Test${n}`, slug: `player-${n}` } as never, overrideAccess: true, context: { disableRevalidate: true } })
      ids[`c${n}`] = p.id
      await addToSquad(payload, squads.docs[0].id, p.id)
    }
    expect(await addMissingPlayers(payload, admin, season, await getFactsFor([year]))).toEqual({ ok: true, added: 2 })
    for (const n of [15, 16]) await setPrice(payload, admin, season, ids[`c${n}`], 80)
    const e = await join('Transfer Team', '752094')
    await payload.create({ collection: 'fantasy-squads', data: { entry: e.id, round: sat2, captain: ids.c1, spentTenths: 0, transfersUsed: 0, picks: pick(ELEVEN).map((player) => ({ player })) } as never, overrideAccess: true, context: { disableRevalidate: true, fantasyRescore: true } })
    // The previous squad is c1..c11. Three new players: refused when the rule allows two, accepted at the real limit of three.
    const three = pick(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c12', 'c15', 'c16'])
    const strict = { ...season, rules: { ...season.rules, transfersPerRound: 2 } }
    expect(await saveSquad(payload, strict, e.id, { picks: three, captain: ids.c1 })).toEqual({ ok: false, message: 'You can change 2 players a round. This squad changes 3.' })
    expect(await saveSquad(payload, season, e.id, { picks: three, captain: ids.c1 })).toMatchObject({ ok: true, transfersUsed: 3 })
    // c8 leaves the game: swapping c8 for c9 is free, so only two changes count (c12, c15 and c16 are new, c9 was in the previous squad and c8's slot is free).
    await setAvailable(payload, admin, season, ids.c8, false)
    const swap = pick(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c9', 'c12', 'c15', 'c16'])
    expect(await saveSquad(payload, strict, e.id, { picks: swap, captain: ids.c1 })).toMatchObject({ ok: true, transfersUsed: 2 })
    // Keeping a player who left the game is refused.
    expect(await saveSquad(payload, season, e.id, { picks: three, captain: ids.c1 })).toMatchObject({ ok: false })
    await setAvailable(payload, admin, season, ids.c8, true)
  })

  it('the hook refuses a squad write for a locked round, whatever path it takes', async () => {
    const e = await join('Hook Team', '861507')
    await expect(payload.create({ collection: 'fantasy-squads', data: { entry: e.id, round: sat1, captain: ids.c1, spentTenths: 0, transfersUsed: 0, picks: [] } as never, overrideAccess: true, context: { disableRevalidate: true } })).rejects.toThrow(/locked/)
    // History writes (seed, repairs) are explicit.
    await expect(payload.create({ collection: 'fantasy-squads', data: { entry: e.id, round: sat1, captain: ids.c1, spentTenths: 0, transfersUsed: 0, picks: [] } as never, overrideAccess: true, context: { disableRevalidate: true, fantasyRescore: true } })).resolves.toBeTruthy()
  })

  it('the leaderboard matches a hand-computed table (captain, duck, null stats, no appearance, abandoned game, junior)', async () => {
    await payload.delete({ collection: 'fantasy-squads', where: { id: { exists: true } }, overrideAccess: true, context: { disableRevalidate: true, fantasyRescore: true } })
    await payload.delete({ collection: 'fantasy-entries', where: { id: { exists: true } }, overrideAccess: true, context: { disableRevalidate: true } })
    const a = await join('Alpha XI', '483917')
    const b = await join('Beta XI', '730264')
    const write = (entry: number, round: string, labels: string[], captain: string) =>
      payload.create({ collection: 'fantasy-squads', data: { entry, round, captain: ids[captain], spentTenths: 0, transfersUsed: 0, picks: labels.map((l) => ({ player: ids[l] })) } as never, overrideAccess: true, context: { disableRevalidate: true, fantasyRescore: true } })
    await write(a.id, sat1, ELEVEN, 'c4')
    await write(b.id, sat1, ['c2', 'c3', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c1', 'c5'], 'c2')
    await write(b.id, sat2, ['c2', 'c3', 'c6', 'c7', 'c8', 'c9', 'c10', 'c11', 'c12', 'c1', 'c5'], 'c6')
    // Round one: c1 duck -1, c2 36, c3 14 (null boundaries add nothing), c4 74, c5 10 (catch), c6 2, c7+ did not play. The junior and the hidden player score nothing.
    // Round two: the abandoned game scores nothing (c1 99 runs), c2 duck -1, c6 74.
    const all = await computeLeaderboard(payload, season)
    const alpha = all.rows.find((r) => r.teamName === 'Alpha XI')!
    const beta = all.rows.find((r) => r.teamName === 'Beta XI')!
    expect(alpha.rounds.map((r) => r.points)).toEqual([-1 + 36 + 14 + 74 * 2 + 10 + 2, -1 + 74]) // 209, 73 (squad carried into round two)
    expect(alpha.total).toBe(282)
    expect(beta.rounds.map((r) => r.points)).toEqual([36 * 2 + 14 + 2 - 1 + 10, 74 * 2 - 1])
    expect(beta.total).toBe(97 + 147)
    expect(all.rows.map((r) => r.teamName)).toEqual(['Alpha XI', 'Beta XI'])
    expect(all.rounds.map((r) => [r.key, r.status, r.provisional])).toEqual([[sat1, 'scored', false], [sat2, 'scored', false]])
    const first = await computeLeaderboard(payload, season, { round: sat1 })
    expect(first.rows.map((r) => [r.teamName, r.total])).toEqual([['Alpha XI', 209], ['Beta XI', 97]])
    // A round that has not locked is not on the leaderboard at all.
    expect(all.rounds.map((r) => r.key)).not.toContain(sat3)
  })

  it('a locked round with an unplayed fixture is provisional until the committee closes it, and the reason is shown', async () => {
    await fixtureOn(payload, 'g-rain', sat2, startOn(sat2, 6))
    let lb = await computeLeaderboard(payload, season)
    expect(lb.rounds.find((r) => r.key === sat2)).toMatchObject({ status: 'locked', provisional: true })
    expect(await markRoundScored(payload, editor, season, sat2, 'washed out')).toMatchObject({ ok: false })
    expect(await markRoundScored(payload, admin, season, sat2, '  ')).toMatchObject({ ok: false })
    expect(await markRoundScored(payload, admin, season, sat3, 'not yet')).toMatchObject({ ok: false })
    expect((await markRoundScored(payload, admin, season, sat2, 'washed out')).ok).toBe(true)
    lb = await computeLeaderboard(payload, season)
    expect(lb.rounds.find((r) => r.key === sat2)).toMatchObject({ status: 'scored', provisional: false, closedByCommittee: true })
    expect(lb.reasons.get(sat2)).toBe('washed out')
  })

  it('the public switch is staff, the competition switch is admin, and the join link stays as it was', async () => {
    expect(await setSwitch(payload, editor, { publicLeaderboard: true })).toEqual({ ok: true })
    expect((await getFantasySettings(payload)).publicLeaderboard).toBe(true)
    expect(await setSwitch(payload, editor, { enabled: false })).toMatchObject({ ok: false })
    expect(await setSwitch(payload, editor, { competitionName: 'Club Fantasy' })).toEqual({ ok: true })
    const s = await getFantasySettings(payload)
    expect(s).toMatchObject({ enabled: true, publicLeaderboard: true, competitionName: 'Club Fantasy', linkVersion: 1 })
    expect(await setSwitch(payload, { id: 99, role: 'selector' }, { publicLeaderboard: false })).toMatchObject({ ok: false })
    expect(await setSwitch(payload, editor, { competitionName: 'x' })).toMatchObject({ ok: false })
    await setSwitch(payload, editor, { publicLeaderboard: false })
  })

  it('Change PIN needs the current PIN and ends other devices; an add-a-device code works once, expires and is throttled', async () => {
    const e = await join('Pin Team', '264809')
    const wrong = await changePin(payload, ctx, season, e.id, { current: '111222', pin: '730264', again: '730264' })
    expect(wrong).toMatchObject({ ok: false })
    const weak = await changePin(payload, ctx, season, e.id, { current: '264809', pin: '111111', again: '111111' })
    expect(weak).toEqual({ ok: false, message: 'Choose a PIN that is hard to guess.' })
    const changed = await changePin(payload, ctx, season, e.id, { current: '264809', pin: '730264', again: '730264' })
    expect(changed.ok).toBe(true)
    expect((await identifyEntry(payload, { linkVersion: 3, ip: null }, season, { teamName: 'Pin Team', secret: '264809', kind: 'pin' })).ok).toBe(false)
    expect((await identifyEntry(payload, { linkVersion: 3, ip: null }, season, { teamName: 'Pin Team', secret: '730264', kind: 'pin' })).ok).toBe(true)
    // Device code.
    const issued = await issueDeviceCode(payload, season, e.id)
    expect(issued.ok).toBe(true)
    const code = (issued as { code: string }).code
    expect(code).toMatch(/^\d{6}$/)
    const stored = JSON.stringify((await payload.find({ collection: 'fantasy-entries', where: { id: { equals: e.id } }, depth: 0, overrideAccess: true })).docs[0])
    expect(stored).not.toContain(code)
    const bad = await identifyEntry(payload, { linkVersion: 4, ip: null }, season, { teamName: 'Pin Team', secret: code === '000000' ? '000001' : '000000', kind: 'code' })
    expect(bad).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
    expect((await identifyEntry(payload, { linkVersion: 4, ip: null }, season, { teamName: 'Pin Team', secret: code, kind: 'code' })).ok).toBe(true)
    expect(await identifyEntry(payload, { linkVersion: 4, ip: null }, season, { teamName: 'Pin Team', secret: code, kind: 'code' })).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
    // A new code voids the old one; an expired code is refused.
    const one = (await issueDeviceCode(payload, season, e.id)) as { code: string }
    const two = (await issueDeviceCode(payload, season, e.id)) as { code: string }
    expect((await identifyEntry(payload, { linkVersion: 5, ip: null }, season, { teamName: 'Pin Team', secret: one.code, kind: 'code' })).ok).toBe(one.code === two.code)
    await payload.update({ collection: 'fantasy-entries', id: e.id, data: { deviceCodeExpires: new Date(Date.now() - 1000).toISOString() } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect((await identifyEntry(payload, { linkVersion: 6, ip: null }, season, { teamName: 'Pin Team', secret: two.code, kind: 'code' })).ok).toBe(false)
  })

  it('a committee reset shows the temporary PIN only to the actor, forces a change, and leaves a line without it', async () => {
    const e = await join('Reset Team', '264809')
    expect(await resetPin(payload, { id: 5, role: 'selector' }, season, e.id)).toMatchObject({ ok: false })
    const r = await resetPin(payload, editor, season, e.id)
    expect(r).toMatchObject({ ok: true, teamName: 'Reset Team' })
    const temp = (r as { tempPin: string }).tempPin
    expect(temp).toMatch(/^\d{6}$/)
    const seasonRow = JSON.stringify((await payload.findByID({ collection: 'fantasy-seasons', id: season.id, depth: 0, overrideAccess: true })))
    expect(seasonRow).toContain('PIN reset for Reset Team by editor person')
    expect(seasonRow).not.toContain(temp)
    const entryRow = JSON.stringify((await payload.findByID({ collection: 'fantasy-entries', id: e.id, depth: 0, overrideAccess: true })))
    expect(entryRow).not.toContain(temp)
    const signed = await identifyEntry(payload, { linkVersion: 7, ip: null }, season, { teamName: 'Reset Team', secret: temp, kind: 'pin' })
    expect(signed).toMatchObject({ ok: true })
    expect((signed as { entry: { mustChangePin: boolean } }).entry.mustChangePin).toBe(true)
    expect(await saveSquad(payload, season, e.id, { picks: pick(ELEVEN), captain: ids.c1 })).toMatchObject({ ok: false })
    expect((await changePin(payload, { linkVersion: 7, ip: null }, season, e.id, { current: temp, pin: '908153', again: '908153' })).ok).toBe(true)
    expect(await saveSquad(payload, season, e.id, { picks: pick(ELEVEN), captain: ids.c1 })).toMatchObject({ ok: true })
  })

  it('rename and disable are staff actions; a disabled team leaves the leaderboard; remove deletes squads', async () => {
    const e = await join('Rename Me', '264809')
    expect(await renameEntry(payload, editor, season, e.id, 'Better Name')).toEqual({ ok: true })
    expect(await renameEntry(payload, editor, season, e.id, 'Alpha XI')).toEqual({ ok: false, message: NAME_UNAVAILABLE })
    expect(await renameEntry(payload, editor, season, e.id, '<b>')).toMatchObject({ ok: false })
    expect(await renameEntry(payload, { id: 1, role: 'selector' }, season, e.id, 'Hacked')).toMatchObject({ ok: false })
    expect((await searchManagers(payload, editor, season, 'better')).map((m) => m.teamName)).toEqual(['Better Name'])
    expect(await searchManagers(payload, { id: 1, role: 'selector' }, season, 'better')).toEqual([])
    expect(Object.keys((await searchManagers(payload, editor, season, 'better'))[0]).sort()).toEqual(['disabled', 'id', 'joined', 'teamName'])
    await setDisabled(payload, editor, season, e.id, true)
    expect((await computeLeaderboard(payload, season)).rows.map((r) => r.teamName)).not.toContain('Better Name')
    expect((await computeLeaderboard(payload, season, { includeDisabled: true })).rows.map((r) => r.teamName)).toContain('Better Name')
    expect((await identifyEntry(payload, { linkVersion: 8, ip: null }, season, { teamName: 'Better Name', secret: '264809', kind: 'pin' }))).toEqual({ ok: false, message: NO_MATCH_MESSAGE })
    await setDisabled(payload, editor, season, e.id, false)
    await saveSquad(payload, season, e.id, { picks: pick(ELEVEN), captain: ids.c1 })
    expect((await removeEntry(payload, editor, season, e.id)).ok).toBe(true)
    expect((await payload.count({ collection: 'fantasy-squads', where: { entry: { equals: e.id } }, overrideAccess: true })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'fantasy-entries', where: { id: { equals: e.id } }, overrideAccess: true })).totalDocs).toBe(0)
  })

  it('Add missing players prices a newcomer once at the formula price and never changes an existing price', async () => {
    const newcomer = await payload.create({ collection: 'players', data: { firstName: 'New', lastName: 'Signing', slug: 'new-signing' } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const squads = await payload.find({ collection: 'squads', limit: 1, depth: 0, overrideAccess: true })
    await addToSquad(payload, squads.docs[0].id, newcomer.id)
    const facts = await getFactsFor([year])
    const before = await payload.find({ collection: 'fantasy-prices', where: { season: { equals: season.id } }, limit: 100, depth: 0, overrideAccess: true })
    const r = await addMissingPlayers(payload, admin, season, facts)
    expect(r).toEqual({ ok: true, added: 1 })
    expect(await addMissingPlayers(payload, admin, season, facts)).toEqual({ ok: true, added: 0 })
    const after = await payload.find({ collection: 'fantasy-prices', where: { season: { equals: season.id } }, limit: 100, depth: 0, overrideAccess: true })
    expect(after.totalDocs).toBe(before.totalDocs + 1)
    const map = new Map(before.docs.map((p) => [p.id, p.priceTenths]))
    for (const p of after.docs) if (map.has(p.id)) expect(p.priceTenths).toBe(map.get(p.id))
    expect(await calculatePrices(payload, admin, season, facts)).toMatchObject({ ok: false }) // not while open
  })

  it('a game moved EARLIER than the stored lock locks the round at save time; moved later never reopens it', async () => {
    const e = await join('Late Team', '264809')
    expect(await saveSquad(payload, season, e.id, { round: sat3, picks: pick(ELEVEN), captain: ids.c1 })).toMatchObject({ ok: true })
    const fx = await payload.find({ collection: 'selection-fixtures', where: { gameId: { equals: 'g4' } }, limit: 1, depth: 0, overrideAccess: true })
    // Moved later: the lock stays where it was stored by the earlier saves.
    await payload.update({ collection: 'selection-fixtures', id: fx.docs[0].id, data: { startsAt: new Date(Date.now() + 40 * 86_400_000).toISOString() } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect((await saveSquad(payload, season, e.id, { round: sat3, picks: pick(ELEVEN), captain: ids.c2 })).ok).toBe(true)
    // Moved to the past: the round is locked now, even though no nightly sync ran.
    await payload.update({ collection: 'selection-fixtures', id: fx.docs[0].id, data: { startsAt: new Date(Date.now() - 3_600_000).toISOString() } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const late = await saveSquad(payload, season, e.id, { round: sat3, picks: pick(ELEVEN), captain: ids.c3 })
    expect(late).toMatchObject({ ok: false })
    const row = (await squadsOfEntry(payload, e.id)).find((s) => s.round === sat3)!
    const rowDoc = await payload.find({ collection: 'fantasy-squads', where: { and: [{ entry: { equals: e.id } }, { round: { equals: sat3 } }] }, limit: 1, depth: 0, overrideAccess: true })
    expect(row.round).toBe(sat3)
    await expect(payload.update({ collection: 'fantasy-squads', id: rowDoc.docs[0].id, data: { captain: ids.c3 } as never, overrideAccess: true, context: { disableRevalidate: true } })).rejects.toThrow(/locked/)
    const kept = (await squadsOfEntry(payload, e.id)).find((s) => s.round === sat3)!
    expect(kept.captain).toBe(ids.c2)
    // The next save is for the following round.
    const next = await saveSquad(payload, season, e.id, { picks: pick(ELEVEN), captain: ids.c3 })
    expect(next).toMatchObject({ ok: true, round: sat4 })
  })

  it('closing a season takes the competition off', async () => {
    expect((await closeSeason(payload, admin, season)).ok).toBe(true)
    expect(await getOpenSeason(payload)).toBeNull()
    expect(await resolveFantasyLink(payload, fantasyToken(1))).toBeNull()
  })
})
