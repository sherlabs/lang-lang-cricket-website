import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { ensureSquads, addMembers, applySeed, loadSquadBoard, moveMember, previewSeed, removeMember, searchCandidates } from '@/lib/selector-squad-queries'
import { loadAvailabilityBoard, rotateLink, setAnswerFor, setLinkEnabled, getLinkInfo, refreshFixturesNow } from '@/lib/selector-availability-queries'
import { savePhone, getProfile } from '@/lib/selector-profile-queries'
import { linkToken } from '@/lib/availability-link'
import { upcomingFixtures } from '@/lib/selection/store'
import { clubToday } from '@/lib/selection-fixtures'
import { clearCollection, destroyTestPayload, getTestPayload } from './helpers'
import { addToSquad, makeFixture, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('@/lib/selection-fixtures', async (orig) => ({ ...(await orig<typeof import('@/lib/selection-fixtures')>()), refreshSelectionFixtures: vi.fn(async () => ({ created: 1, updated: 0, moved: 0, removed: 0, kept: 0, skipped: 0 })) }))

describe('squads, board and selector-side availability', () => {
  let payload: Payload
  let user: { id: number; role: 'selector'; collection: 'users'; email: string }
  const year = currentSeasonStartYear()

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    const u = await payload.create({ collection: 'users', data: { email: 'selector@example.com', password: 'selector-pass-123', role: 'selector' }, context: { seedAdmin: true, disableRevalidate: true } })
    user = { id: u.id, role: 'selector', collection: 'users', email: u.email }
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
  })
  const u = () => user as never

  it('squads are made for every grade with an upcoming game, once, even when asked in parallel', async () => {
    await makeFixture(payload)
    await makeFixture(payload, { gradeId: 'grade-a', gradeName: 'A Grade' })
    const fixtures = await upcomingFixtures(payload, clubToday())
    await Promise.all(Array.from({ length: 5 }, () => ensureSquads(payload, year, fixtures)))
    const squads = (await payload.find({ collection: 'squads', overrideAccess: true, pagination: false, depth: 0 })).docs
    expect(squads.map((s) => s.gradeId).sort()).toEqual(['grade-a', 'grade-b'])
  })

  it('add, remove and move members; membership rows record who added them; no duplicates', async () => {
    const [a, b] = [await makePlayer(payload, 'Ann', 'A'), await makePlayer(payload, 'Bob', 'B')]
    const sb = await makeSquad(payload, year, 'grade-b', 'B Grade')
    const sa = await makeSquad(payload, year, 'grade-a', 'A Grade')
    expect(await addMembers(u(), sb.id, [a.id, b.id, a.id])).toEqual({ ok: true, changed: 2 })
    expect(await addMembers(u(), sb.id, [a.id])).toEqual({ ok: true, changed: 0 })
    const row = (await payload.find({ collection: 'squad-members', overrideAccess: true, depth: 0, pagination: false })).docs[0]
    expect(row.addedBy).toBe(user.id)
    expect(row.addedAt).toBeTruthy()
    expect(await moveMember(u(), sb.id, sa.id, a.id)).toEqual({ ok: true, changed: 1 })
    const members = async (squad: number) => (await payload.find({ collection: 'squad-members', where: { squad: { equals: squad } }, overrideAccess: true, depth: 0, pagination: false })).docs.map((m) => m.player)
    expect(await members(sb.id)).toEqual([b.id])
    expect(await members(sa.id)).toEqual([a.id])
    expect((await removeMember(u(), sa.id, a.id)).ok).toBe(true)
    expect(await members(sa.id)).toEqual([])
    expect((await addMembers(u(), 99999, [a.id])).ok).toBe(false)
  })

  it('two parallel moves of different players lose nothing, and a double move of one player settles', async () => {
    const players = await Promise.all(['P1', 'P2', 'P3'].map((n) => makePlayer(payload, n, 'Test')))
    const sb = await makeSquad(payload, year, 'grade-b', 'B Grade')
    const sa = await makeSquad(payload, year, 'grade-a', 'A Grade')
    await addMembers(u(), sb.id, players.map((p) => p.id))
    await Promise.all([moveMember(u(), sb.id, sa.id, players[0].id), moveMember(u(), sb.id, sa.id, players[1].id), moveMember(u(), sb.id, sa.id, players[0].id)])
    const members = async (squad: number) => (await payload.find({ collection: 'squad-members', where: { squad: { equals: squad } }, overrideAccess: true, depth: 0, pagination: false })).docs.map((m) => m.player).sort()
    expect(await members(sa.id)).toEqual([players[0].id, players[1].id].sort())
    expect(await members(sb.id)).toEqual([players[2].id])
  })

  it('the squad board shows role, games, recency, the next three availability answers and "also in"', async () => {
    const ann = await makePlayer(payload, 'Ann', 'A')
    const sb = await makeSquad(payload, year, 'grade-b', 'B Grade')
    const sa = await makeSquad(payload, year, 'grade-a', 'A Grade')
    await addToSquad(payload, sb.id, ann.id)
    await addToSquad(payload, sa.id, ann.id)
    const f1 = await makeFixture(payload, { localDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) })
    await makeFixture(payload, { gradeId: 'grade-a', gradeName: 'A Grade' })
    await setAnswerFor(u(), ann.id, f1.id, 'maybe')
    await payload.update({ collection: 'player-selection-profiles', id: (await payload.create({ collection: 'player-selection-profiles', data: { player: ann.id, role: 'keeper' } as never, overrideAccess: true })).id, data: { role: 'keeper' } as never, overrideAccess: true })
    await payload.create({ collection: 'player-seasons', data: { player: ann.id, seasonName: `${year}/${String(year + 1).slice(2)}`, seasonOrder: 0, teamId: 't', teamName: 'T', gradeName: 'B Grade', games: 7 } as never, overrideAccess: true })
    const board = await loadSquadBoard(u())
    const b = board.grades.find((g) => g.gradeId === 'grade-b')!
    expect(b.cards[0]).toMatchObject({ name: 'Ann A', role: 'keeper', games: 7, recency: 'this-season', alsoIn: ['A Grade'] })
    expect(b.cards[0].next).toEqual([{ fixtureId: f1.id, answer: 'maybe' }])
  })

  it('the candidates sheet filters by recency and name and leaves out people already in the squad', async () => {
    const [played, never, member] = [await makePlayer(payload, 'Played', 'Lately'), await makePlayer(payload, 'Never', 'Played'), await makePlayer(payload, 'Already', 'In')]
    const sb = await makeSquad(payload, year, 'grade-b', 'B Grade')
    await addToSquad(payload, sb.id, member.id)
    await payload.create({ collection: 'player-seasons', data: { player: played.id, seasonName: `${year - 1}/${String(year).slice(2)}`, seasonOrder: 1, teamId: 't', teamName: 'T', gradeName: 'B Grade', games: 4 } as never, overrideAccess: true })
    expect((await searchCandidates(u(), sb.id, { recency: 'last-season' })).map((c) => c.id)).toEqual([played.id])
    expect((await searchCandidates(u(), sb.id, { recency: 'never' })).map((c) => c.id)).toEqual([never.id])
    expect((await searchCandidates(u(), sb.id, { q: 'lately' })).map((c) => c.name)).toEqual(['Played Lately'])
    expect((await searchCandidates(u(), sb.id, {})).map((c) => c.id)).not.toContain(member.id)
  })

  it('start from last season previews first, honours a grade rename, never removes anyone, and applying twice adds nothing new', async () => {
    const [a, b, c] = [await makePlayer(payload, 'A', 'One'), await makePlayer(payload, 'B', 'Two'), await makePlayer(payload, 'C', 'Three')]
    const sb = await makeSquad(payload, year, 'grade-b', 'Premier Grade')
    const sa = await makeSquad(payload, year, 'grade-a', 'A Grade')
    const last = `${year - 1}/${String(year).slice(2)}`
    for (const [p, grade] of [[a, '2. Premier Grade'], [b, 'Premier Grade'], [c, 'A Grade']] as const) {
      await payload.create({ collection: 'player-seasons', data: { player: p.id, seasonName: last, seasonOrder: 1, teamId: `t${p.id}`, teamName: 'T', gradeName: grade, games: 5 } as never, overrideAccess: true })
    }
    await addToSquad(payload, sa.id, (await makePlayer(payload, 'Existing', 'Member')).id)
    const preview = await previewSeed(u(), (g) => g.replace(/^\d+\.\s*/, ''))
    expect(preview.fromYear).toBe(year - 1)
    expect(preview.grades.map((g) => [g.gradeName, g.add.map((p) => p.name)])).toEqual([['A Grade', ['C Three']], ['Premier Grade', ['A One', 'B Two']]])
    expect((await payload.find({ collection: 'squad-members', overrideAccess: true, pagination: false })).docs).toHaveLength(1)
    expect(await applySeed(u(), (g) => g.replace(/^\d+\.\s*/, ''))).toEqual({ added: 3 })
    expect(await applySeed(u(), (g) => g.replace(/^\d+\.\s*/, ''))).toEqual({ added: 0 })
    expect((await payload.find({ collection: 'squad-members', where: { squad: { equals: sb.id } }, overrideAccess: true, pagination: false })).docs).toHaveLength(2)
    expect((await payload.find({ collection: 'squad-members', where: { squad: { equals: sa.id } }, overrideAccess: true, pagination: false })).docs).toHaveLength(2)
  })

  it('the availability board tallies a fixture and lists squad players with their phone; a selector sets and clears one answer as themselves', async () => {
    const [ann, bob] = [await makePlayer(payload, 'Ann', 'A'), await makePlayer(payload, 'Bob', 'B')]
    const sb = await makeSquad(payload, year, 'grade-b', 'B Grade')
    await addToSquad(payload, sb.id, ann.id)
    await addToSquad(payload, sb.id, bob.id)
    const f = await makeFixture(payload)
    await savePhone(u(), ann.id, '0400 000 011')
    expect(await setAnswerFor(u(), ann.id, f.id, 'in')).toEqual({ ok: true })
    expect((await setAnswerFor(u(), bob.id, f.id, 'nonsense')).ok).toBe(false)
    expect((await setAnswerFor(u(), 99999, f.id, 'in')).ok).toBe(false)
    const row = (await payload.find({ collection: 'availability', overrideAccess: true, depth: 0 })).docs[0]
    expect(row).toMatchObject({ source: 'selector', setBy: user.id, status: 'in' })
    const board = await loadAvailabilityBoard(u())
    expect(board.fixtures[0].tally).toEqual({ in: 1, maybe: 0, out: 0, none: 1 })
    expect(board.players.find((p) => p.name === 'Ann A')).toMatchObject({ phone: '0400000011', answers: { [f.id]: 'in' } })
    expect(await setAnswerFor(u(), ann.id, f.id, 'none')).toEqual({ ok: true })
    expect((await loadAvailabilityBoard(u())).fixtures[0].tally.none).toBe(2)
  })

  it('the link: shown, rotated (new token), switched off; refresh fixtures is limited to one press per five minutes', async () => {
    const before = await getLinkInfo(u())
    expect(before).toMatchObject({ enabled: true, version: 1, token: linkToken(1), path: `/availability/${linkToken(1)}` })
    const rotated = await rotateLink(u())
    expect(rotated.linkVersion).toBe(2)
    expect((await getLinkInfo(u())).token).toBe(linkToken(2))
    expect((await setLinkEnabled(u(), false)).linkEnabled).toBe(false)
    expect((await getLinkInfo(u())).enabled).toBe(false)
    expect((await refreshFixturesNow(u())).ok).toBe(true)
    const again = await refreshFixturesNow(u())
    expect(again.ok).toBe(false)
  })

  it('every selector-side function refuses a caller who is not a selection user', async () => {
    const nobody = null as never
    const anonymousLike = { id: 5, role: 'viewer' } as never
    for (const caller of [nobody, anonymousLike]) {
      await expect(loadSquadBoard(caller)).rejects.toThrow()
      await expect(addMembers(caller, 1, [1])).rejects.toThrow()
      await expect(loadAvailabilityBoard(caller)).rejects.toThrow()
      await expect(setAnswerFor(caller, 1, 1, 'in')).rejects.toThrow()
      await expect(rotateLink(caller)).rejects.toThrow()
      await expect(getProfile(caller, 1)).rejects.toThrow()
      await expect(savePhone(caller, 1, '0400000000')).rejects.toThrow()
    }
  })
})
