import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { loadBuilder, loadPlayerExtras, loadWeekendBoard, previewTeam, publishSheets, saveSheet, withdrawSheet } from '@/lib/selector-team-queries'
import { setAnswerFor } from '@/lib/selector-availability-queries'
import { getPublishedTeam, getPublishedWeekend, listPublishedGamesForSitemap, postTextFor } from '@/lib/teams-queries'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'
import { addToSquad, isoDate, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)

describe('team selection: save, publish, withdraw and the public read', () => {
  let payload: Payload
  let user: { id: number; role: 'selector'; collection: 'users'; email: string }
  const u = () => user as never
  const year = currentSeasonStartYear()

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const row = await payload.create({ collection: 'users', data: { email: 'selector@example.com', password: 'selector-pass-123', role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })
    user = { id: row.id, role: 'selector', collection: 'users', email: row.email }
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    cache.revalidateTag.mockClear()
    cache.revalidatePath.mockClear()
  })

  async function setup(n = 3) {
    const fixture = await makeFixture(payload, { gameId: 'game-a' })
    const squad = await makeSquad(payload, year, 'grade-b', 'B Grade')
    const players = []
    for (let i = 0; i < n; i++) {
      const p = await makePlayer(payload, `Player${String.fromCharCode(65 + i)}`, 'Test')
      await addToSquad(payload, squad.id, p.id)
      players.push(p)
    }
    return { fixture, squad, players }
  }
  const slot = (playerId: number, extra: Record<string, unknown> = {}) => ({ playerId, ...extra })
  const save = (gameId: string, expectedRevision: number, slots: object[], over: Record<string, unknown> = {}) => saveSheet(u(), { gameId, expectedRevision, size: 11, markedReady: false, slots, ...over } as never)

  it('creates a sheet, bumps the revision, derives updatedBy, refuses a stale save and a duplicate first save', async () => {
    const { players } = await setup()
    const first = await save('game-a', 0, [slot(players[0].id, { isCaptain: true }), slot(players[1].id)])
    expect(first).toEqual({ ok: true, revision: 1 })
    const row = (await payload.find({ collection: 'team-sheets', overrideAccess: true, depth: 0, pagination: false })).docs[0]
    expect(row.updatedBy).toBe(user.id)
    expect(row.slots?.map((s) => s.order)).toEqual([1, 2])
    expect(await save('game-a', 0, [slot(players[0].id)])).toMatchObject({ ok: false, stale: true })
    expect(await save('game-a', 1, [slot(players[0].id), slot(players[1].id), slot(players[2].id)])).toEqual({ ok: true, revision: 2 })
    expect(await save('game-a', 1, [slot(players[0].id)])).toMatchObject({ ok: false, stale: true })
  })

  it('of two saves from the same revision exactly one wins (new sheet and existing sheet)', async () => {
    const { players } = await setup()
    const racing = await Promise.all([save('game-a', 0, [slot(players[0].id)]), save('game-a', 0, [slot(players[1].id)])])
    expect(racing.filter((r) => r.ok)).toHaveLength(1)
    const again = await Promise.all(Array.from({ length: 6 }, (_, i) => save('game-a', 1, [slot(players[i % 3].id)])))
    expect(again.filter((r) => r.ok)).toHaveLength(1)
  })

  it('refuses bad input: duplicates, bad guest names, oversize, unknown players, bad size', async () => {
    const { players } = await setup()
    expect((await save('game-a', 0, [slot(players[0].id), slot(players[0].id)])).ok).toBe(false)
    expect((await save('game-a', 0, [{ guestName: 'Bad Name 7' }])).ok).toBe(false)
    expect((await save('game-a', 0, [{ guestName: 'sam@x.test' }])).ok).toBe(false)
    expect((await save('game-a', 0, [slot(999999)])).ok).toBe(false)
    expect((await save('game-a', 0, [slot(players[0].id), slot(players[1].id)], { size: 7 })).ok).toBe(false)
    expect((await save('game-a', 0, [slot(players[0].id), slot(players[1].id), slot(players[2].id)], { size: 11 })).ok).toBe(true)
    expect((await save('nope', 0, [])).ok).toBe(false)
    expect((await save('game-a', 1, Array.from({ length: 21 }, () => slot(players[0].id)))).ok).toBe(false)
  })

  it('ignores a forged updatedBy and keeps one captain and one keeper', async () => {
    const { players } = await setup()
    await save('game-a', 0, [slot(players[0].id, { isCaptain: true, isKeeper: true }), slot(players[1].id, { isCaptain: true, isKeeper: true, updatedBy: 99999 })])
    const row = (await payload.find({ collection: 'team-sheets', overrideAccess: true, depth: 0, pagination: false })).docs[0]
    expect(row.updatedBy).toBe(user.id)
    expect(row.slots?.filter((s) => s.isCaptain)).toHaveLength(1)
    expect(row.slots?.filter((s) => s.isKeeper)).toHaveLength(1)
  })

  it('a selector cannot write sheets or publish fields over REST', async () => {
    const { fixture, players } = await setup()
    await expect(payload.create({ collection: 'team-sheets', data: { fixture: fixture.id, slots: [{ player: players[0].id, order: 1 }] } as never, user: u(), overrideAccess: false })).rejects.toThrow()
    await save('game-a', 0, [slot(players[0].id)])
    const sheet = (await payload.find({ collection: 'team-sheets', overrideAccess: true, depth: 0, pagination: false })).docs[0]
    await expect(payload.update({ collection: 'team-sheets', id: sheet.id, data: { publishedAt: new Date().toISOString() } as never, user: u(), overrideAccess: false })).rejects.toThrow()
    await expect(payload.find({ collection: 'team-sheets', user: u(), overrideAccess: false })).rejects.toThrow()
  })

  it('publish: nothing is public before, the XI is public after, edits stay private, hidden players are withheld, and a repeat is idempotent', async () => {
    const { players } = await setup(3)
    await save('game-a', 0, [slot(players[0].id, { isCaptain: true }), slot(players[1].id, { isKeeper: true }), { guestName: 'Sam Guest' }])
    expect(await getPublishedTeam('game-a')).toBeNull()
    expect(await getPublishedWeekend()).toBeNull()

    const needs = await publishSheets(u(), { gameIds: ['game-a'], announce: true, acknowledged: false })
    expect(needs.ok).toBe(false)
    expect(needs.ok === false && needs.needsAcknowledgement?.length).toBeGreaterThan(0)
    expect(await getPublishedTeam('game-a')).toBeNull()

    const done = await publishSheets(u(), { gameIds: ['game-a'], announce: true, acknowledged: true })
    expect(done.ok).toBe(true)
    const team = await getPublishedTeam('game-a')
    expect(team?.slots.map((s) => [s.order, s.name, s.guest])).toEqual([[1, 'PlayerA Test', false], [2, 'PlayerB Test', false], [3, 'Sam Guest', true]])
    expect(team?.updated).toBe(false)
    expect(cache.revalidateTag).toHaveBeenCalledWith('teams', { expire: 0 })
    expect((await getPublishedWeekend())?.teams).toHaveLength(1)

    // an edit stays private until it is published
    await save('game-a', 1, [slot(players[2].id), slot(players[0].id)])
    expect((await getPublishedTeam('game-a'))?.slots.map((s) => s.name)).toEqual(['PlayerA Test', 'PlayerB Test', 'Sam Guest'])
    const b = await loadBuilder(u(), 'game-a')
    expect(b?.view.chip).toBe('published-changed')
    expect(b?.view.changes.length).toBeGreaterThan(0)

    // hiding a player after publishing withholds the name but keeps the slot
    await payload.update({ collection: 'players', id: players[1].id, data: { hidden: true }, overrideAccess: true, context: { disableRevalidate: true } })
    expect((await getPublishedTeam('game-a'))?.slots.map((s) => s.name)).toEqual(['PlayerA Test', 'Player name withheld', 'Sam Guest'])

    // publish again: one announcement only, marked updated
    await payload.update({ collection: 'players', id: players[1].id, data: { hidden: false }, overrideAccess: true, context: { disableRevalidate: true } })
    expect((await publishSheets(u(), { gameIds: ['game-a'], announce: true, acknowledged: true })).ok).toBe(true)
    expect((await publishSheets(u(), { gameIds: ['game-a'], announce: true, acknowledged: true })).ok).toBe(true)
    const anns = await payload.find({ collection: 'announcements', where: { autoKey: { like: 'teams:' } }, overrideAccess: true, depth: 0, pagination: false, showHiddenFields: true })
    expect(anns.docs).toHaveLength(1)
    expect(anns.docs[0]).toMatchObject({ published: true, link: '/teams', linkLabel: 'See the teams' })
    expect(anns.docs[0].title).toMatch(/^Matchday .*\(updated\)$/)
    expect(String(anns.docs[0].body)).not.toMatch(/Player[ABC] Test|Sam Guest/) // the stored text never names a player
    const after = await getPublishedTeam('game-a')
    expect(after?.updated).toBe(true)
    expect(after?.slots.map((s) => s.name)).toEqual(['PlayerC Test', 'PlayerA Test'])
  })

  it('blocks publishing a hidden player, an empty team and a stale builder; announce=false posts nothing', async () => {
    const { players } = await setup(2)
    expect((await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true })).ok).toBe(false)
    await save('game-a', 0, [slot(players[0].id)])
    await payload.update({ collection: 'players', id: players[0].id, data: { hidden: true }, overrideAccess: true, context: { disableRevalidate: true } })
    const hidden = await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true })
    expect(hidden.ok === false && hidden.error).toMatch(/hidden/)
    await payload.update({ collection: 'players', id: players[0].id, data: { hidden: false }, overrideAccess: true, context: { disableRevalidate: true } })
    const stale = await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true, expectedRevisions: { 'game-a': 0 } })
    expect(stale.ok).toBe(false)
    const ok = await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true, expectedRevisions: { 'game-a': 1 } })
    expect(ok.ok).toBe(true)
    expect((await payload.find({ collection: 'announcements', where: { autoKey: { like: 'teams:' } }, overrideAccess: true, depth: 0, pagination: false, showHiddenFields: true })).docs).toHaveLength(0)
  })

  it('bulk publish needs every team to be marked Ready', async () => {
    const { players } = await setup(2)
    await save('game-a', 0, [slot(players[0].id)])
    const notReady = await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true, requireReady: true })
    expect(notReady.ok === false && notReady.error).toMatch(/not marked Ready/)
    expect(await getPublishedTeam('game-a')).toBeNull()
    await save('game-a', 1, [slot(players[0].id)], { markedReady: true })
    expect((await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true, requireReady: true, expectedRevisions: { 'game-a': 2 } })).ok).toBe(true)
  })

  it('withdraw: the team and its announcement go; draft, withdrawn, removed and unknown ids all read as null', async () => {
    const { fixture, players } = await setup(2)
    await save('game-a', 0, [slot(players[0].id), slot(players[1].id)])
    await publishSheets(u(), { gameIds: ['game-a'], announce: true, acknowledged: true })
    expect(await getPublishedTeam('game-a')).not.toBeNull()
    expect((await withdrawSheet(u(), 'game-a')).ok).toBe(true)
    expect(await getPublishedTeam('game-a')).toBeNull()
    expect(await getPublishedTeam('unknown-game')).toBeNull()
    expect(await getPublishedTeam('../etc')).toBeNull()
    const ann = (await payload.find({ collection: 'announcements', where: { autoKey: { like: 'teams:' } }, overrideAccess: true, depth: 0, pagination: false, showHiddenFields: true })).docs[0]
    expect(ann.published).toBe(false)
    await publishSheets(u(), { gameIds: ['game-a'], announce: true, acknowledged: true })
    await payload.update({ collection: 'selection-fixtures', id: fixture.id, data: { status: 'removed' }, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await getPublishedTeam('game-a')).toBeNull()
    expect(await listPublishedGamesForSitemap()).toEqual([])
  })

  it('sitemap lists only published, non-removed games; the weekend picks the current one; post text comes from config', async () => {
    const { players } = await setup(2)
    await makeFixture(payload, { gameId: 'game-draft', gradeId: 'grade-a', gradeName: 'A Grade', localDate: isoDate(5) })
    await save('game-a', 0, [slot(players[0].id, { isCaptain: true }), slot(players[1].id)])
    await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true })
    expect((await listPublishedGamesForSitemap()).map((g) => g.gameId)).toEqual(['game-a'])
    const team = (await getPublishedWeekend())!.teams[0]
    const text = await postTextFor(team)
    expect(text).toContain('B Grade v Example Rovers')
    expect(text).toContain('1. PlayerA Test (c)')
    expect(text.split('\n').pop()).toMatch(/\/teams$/)
  })

  it('shows batting order only when the setting says so', async () => {
    const { players } = await setup(2)
    await save('game-a', 0, [slot(players[1].id), slot(players[0].id)])
    await publishSheets(u(), { gameIds: ['game-a'], announce: false, acknowledged: true })
    await payload.updateGlobal({ slug: 'selection-settings', data: { publishBattingOrder: false }, overrideAccess: true, context: { disableRevalidate: true } })
    const t = await getPublishedTeam('game-a')
    expect(t?.showOrder).toBe(false)
    expect(t?.slots.map((s) => s.name)).toEqual(['PlayerA Test', 'PlayerB Test'])
    await payload.updateGlobal({ slug: 'selection-settings', data: { publishBattingOrder: true }, overrideAccess: true, context: { disableRevalidate: true } })
  })

  it('warns when a picked player is out, when a player is picked in two grades the same day, and when the game was removed', async () => {
    const { fixture, players } = await setup(2)
    const other = await makeFixture(payload, { gameId: 'game-other', gradeId: 'grade-a', gradeName: 'A Grade' })
    await setAnswerFor(u(), players[0].id, fixture.id, 'out')
    await save('game-a', 0, [slot(players[0].id), slot(players[1].id)])
    await save('game-other', 0, [slot(players[1].id)])
    const view = (await loadBuilder(u(), 'game-a'))!.view
    const codes = view.warnings.map((w) => w.code)
    expect(codes).toContain('player-out')
    expect(codes).toContain('double-booked')
    expect(view.status).toBe('needs-attention')
    await payload.update({ collection: 'selection-fixtures', id: other.id, data: { status: 'removed' }, overrideAccess: true, context: { disableRevalidate: true } })
    expect((await loadBuilder(u(), 'game-other'))!.view.warnings.map((w) => w.code)).toContain('fixture-removed')
  })

  it('the weekend board counts replies, lists who has not replied and flags a missing keeper', async () => {
    const { fixture, players } = await setup(3)
    await setAnswerFor(u(), players[0].id, fixture.id, 'in')
    await setAnswerFor(u(), players[1].id, fixture.id, 'out')
    await payload.create({ collection: 'player-selection-profiles', data: { player: players[2].id, phone: '0400000011', canKeep: true } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const board = await loadWeekendBoard(u())
    expect(board.fixtures).toHaveLength(1)
    const f = board.fixtures[0]
    expect(f.availability.tally).toEqual({ in: 1, maybe: 0, out: 1, none: 1 })
    expect(f.availability.noReply.map((n) => [n.name, n.phone])).toEqual([['PlayerC Test', '0400000011']])
    expect(f.availability.keeperAvailable).toBe(false) // the only keeper has not replied
    await setAnswerFor(u(), players[2].id, fixture.id, 'maybe')
    expect((await loadWeekendBoard(u())).fixtures[0].availability.keeperAvailable).toBe(true)
    expect(f.view.status).toBe('not-started')
    expect(f.reminder).toContain('PlayerC')
  })

  it('previews the working team and loads the player card extras', async () => {
    const { fixture, players } = await setup(2)
    expect(await previewTeam(u(), 'game-a')).toBeNull()
    await save('game-a', 0, [slot(players[0].id)])
    expect((await previewTeam(u(), 'game-a'))?.slots[0].name).toBe('PlayerA Test')
    await setAnswerFor(u(), players[0].id, fixture.id, 'maybe')
    const extras = await loadPlayerExtras(u(), players[0].id)
    expect(extras.batting).toBe('No data')
    expect(extras.upcoming[0]).toMatchObject({ gradeName: 'B Grade', answer: 'maybe' })
  })

  it('reads the last five scores from stored games, newest first, with not-outs and no fill-ins', async () => {
    const { players } = await setup(2)
    const ctx = { disableRevalidate: true }
    const mk = async (n: number, date: string, runs: number, status: string, wk: number, wr: number) => {
      const m = await payload.create({ collection: 'matches', data: { gameId: `m-${n}`, status: 'FINAL', localDate: date } as never, overrideAccess: true, context: ctx })
      const inn = await payload.create({ collection: 'match-innings', data: { match: m.id, sequenceNo: 1 } as never, overrideAccess: true, context: ctx })
      await payload.create({ collection: 'match-appearances', data: { match: m.id, appearanceId: 'a1', player: players[0].id, isClubSide: true } as never, overrideAccess: true, context: ctx })
      await payload.create({ collection: 'match-batting', data: { match: m.id, innings: inn.id, appearanceId: 'a1', battingStatus: status, runs } as never, overrideAccess: true, context: ctx })
      await payload.create({ collection: 'match-bowling', data: { match: m.id, innings: inn.id, appearanceId: 'a1', wickets: wk, runs: wr, balls: 24 } as never, overrideAccess: true, context: ctx })
    }
    await mk(1, isoDate(-10), 23, 'out', 2, 31)
    await mk(2, isoDate(-20), 51, 'not_out', 0, 22)
    await mk(3, isoDate(-30), 0, 'out', 1, 10)
    await mk(4, isoDate(-900), 99, 'out', 5, 5) // outside the window
    const extras = await loadPlayerExtras(u(), players[0].id)
    expect(extras.batting).toBe('23, 51*, 0')
    expect(extras.bowling).toBe('2/31, 0/22, 1/10')
    expect((await loadPlayerExtras(u(), players[1].id)).batting).toBe('No data')
    await payload.db.drizzle.execute((await import('@payloadcms/db-postgres/drizzle')).sql.raw('TRUNCATE "payload"."matches" RESTART IDENTITY CASCADE'))
  })
})
