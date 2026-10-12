import type { Payload, TypedUser } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetSelection } from './selection-helpers'
import { ballotCount, makeFinalGame, makeTeam, settingsPatch, votesOn } from './votes-helpers'
import { auditVoters, deleteBallot, enterSelectorBallot, exportVotesCsv, loadPresentSnapshot, loadPrivateBoard, loadVoteGame, loadVoteSettingsView, loadVotesHome, saveVoteSettings, setGameVotes } from '@/lib/selector-votes-queries'
import { computeBoard, firstPublicGradeId, getPublicBoard, publicLeaderboardIndexable, publicLeaderboardOn, writeBallot } from '@/lib/votes-queries'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const ctl = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => ctl.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`)
  },
}))

const LOCALE = 'en-AU'

/** Season of three finished games and one still voting, against real Postgres. */
describe('best-player votes: the board, the public page and who can see what', () => {
  let payload: Payload
  let team: { id: number; name: string }[]
  let admin: TypedUser
  let editor: TypedUser
  let selector: TypedUser
  let tokens: { admin: string; editor: string; selector: string }
  let closedGame: { id: number }
  let openGame: { id: number }
  let thinGame: { id: number }

  const voter = (i: number) => team[i].id
  /** `n` ballots naming the same top three: voters are players 3..(3+n-1) so nobody votes for themselves. */
  async function fill(game: { id: number }, n: number, picks: [number, number, number]) {
    for (let i = 0; i < n; i++) {
      await writeBallot(payload, { fixtureId: game.id, voterKey: `player:${voter(3 + i)}`, voterPlayerId: voter(3 + i), picks: picks.map((p, k) => ({ place: k + 1, playerId: voter(p) })), source: 'voter', castBy: null })
    }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    tokens = { admin: await tokenFor(payload, 'admin'), editor: await tokenFor(payload, 'editor'), selector: await tokenFor(payload, 'selector') }
    const get = async (email: string) => {
      const u = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })).docs[0]
      return { id: u.id, role: u.role, collection: 'users', email: u.email } as unknown as TypedUser
    }
    admin = await get('admin@example.com')
    editor = await get('editor@example.com')
    selector = await get('selector@example.com')
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    team = await makeTeam(payload, 12)
    const ids = team.map((p) => p.id)
    closedGame = await makeFinalGame(payload, ids, { daysAgo: 12 })
    thinGame = await makeFinalGame(payload, ids, { daysAgo: 26 })
    openGame = await makeFinalGame(payload, ids, { daysAgo: 1 })
    await votesOn(payload, { minBallotsToCount: 5, publicLeaderboard: true })
    await fill(closedGame, 6, [0, 1, 2]) // Player01 15 pts... top three
    await fill(thinGame, 4, [7, 6, 5]) // below the minimum of 5: counts nowhere
    await fill(openGame, 6, [9, 8, 7]) // still open: nothing public
    ctl.headers = new Headers()
  })

  describe('REST and the admin: nobody can read a ballot', () => {
    it('anonymous, selector, editor and admin all get nothing from find, count, where probes and by id', async () => {
      const ballot = (await payload.find({ collection: 'best-player-ballots', limit: 1, depth: 0, overrideAccess: true })).docs[0]
      const probes = ['/best-player-ballots', '/best-player-ballots/count', `/best-player-ballots/${ballot.id}`, '/best-player-ballots?where[voterKey][equals]=player:4', `/best-player-ballots?where[picks.player][equals]=${voter(0)}`, '/best-player-ballots?where[voter][exists]=true']
      for (const token of [undefined, tokens.selector, tokens.editor, tokens.admin]) {
        for (const path of probes) {
          const res = await rest('GET', path, { token })
          expect([401, 403, 404], `${token ? 'token' : 'anon'} ${path}`).toContain(res.status)
          expect(JSON.stringify(res.json ?? {})).not.toMatch(/voterKey|"picks"/)
        }
        for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
          const res = await rest(method, method === 'POST' ? '/best-player-ballots' : `/best-player-ballots/${ballot.id}`, { token, body: { fixture: closedGame.id, voterKey: 'x', picks: [] } })
          expect([401, 403, 404]).toContain(res.status)
        }
      }
      // The admin document view reads through the same access rule: refused for an admin too.
      await expect(payload.findByID({ collection: 'best-player-ballots', id: ballot.id, user: admin, overrideAccess: false })).rejects.toThrow()
      const probe = await payload.find({ collection: 'best-player-ballots', user: admin, overrideAccess: false, where: { 'picks.player': { equals: voter(0) } } }).catch(() => ({ docs: [] }))
      expect(probe.docs).toEqual([])
    })

    it('fixtures cannot be changed over REST, so votesState and countsForAwards are written only by code', async () => {
      for (const token of [tokens.selector, tokens.editor, tokens.admin]) {
        const res = await rest('PATCH', `/selection-fixtures/${closedGame.id}`, { token, body: { votesState: 'closed', countsForAwards: false } })
        expect([401, 403, 404]).toContain(res.status)
      }
      const f = await payload.findByID({ collection: 'selection-fixtures', id: closedGame.id, depth: 0, overrideAccess: true })
      expect(f.countsForAwards).toBe(true)
    })

    it('the global stays admin-only over REST (editors change vote options only through the staff action)', async () => {
      const res = await rest('PATCH', '/globals/selection-settings', { token: tokens.editor, body: { votes: { enabled: false } } })
      expect([401, 403, 404]).toContain(res.status)
    })
  })

  describe('audit of who voted', () => {
    it('admin sees who voted and from where, never picks; editor and selector are refused', async () => {
      const rows = await auditVoters(admin, closedGame.id)
      expect(rows).toHaveLength(6)
      expect(rows![0]).toEqual({ name: expect.any(String), playerId: expect.any(Number), source: 'voter', castAt: expect.any(String) })
      expect(JSON.stringify(rows)).not.toMatch(/picks|place/)
      expect(await auditVoters(editor, closedGame.id)).toBeNull()
      expect(await auditVoters(selector, closedGame.id)).toBeNull()
    })

    it('admin deletes one ballot so that player can vote again; others cannot', async () => {
      expect(await deleteBallot(editor, closedGame.id, voter(3))).toMatchObject({ ok: false })
      expect(await deleteBallot(selector, closedGame.id, voter(3))).toMatchObject({ ok: false })
      expect(await ballotCount(payload, closedGame.id)).toBe(6)
      expect(await deleteBallot(admin, closedGame.id, voter(3))).toEqual({ ok: true })
      expect(await ballotCount(payload, closedGame.id)).toBe(5)
      expect(await deleteBallot(admin, closedGame.id, voter(3))).toMatchObject({ ok: false })
    })
  })

  describe('selector area reads: participation, the private board and entering a ballot', () => {
    it('lists every game with who has voted, counts the thin game as not counted and the open game as private', async () => {
      const home = await loadVotesHome(selector)
      const byId = new Map(home.games.map((g) => [g.id, g]))
      expect(byId.get(closedGame.id)).toMatchObject({ status: 'closed', voted: 6, counts: true, eligible: 12 })
      expect(byId.get(thinGame.id)).toMatchObject({ status: 'closed', voted: 4, counts: false, needed: 5 })
      expect(byId.get(openGame.id)).toMatchObject({ status: 'open', voted: 6 })
      expect(home.isStaff).toBe(false)
      expect((await loadVotesHome(editor)).isStaff).toBe(true)
    })

    it('the private board includes the open game; a game under the minimum is in the participation list but in no total', async () => {
      const { board } = await loadPrivateBoard(selector, { locale: LOCALE })
      const names = board.result.rows.map((r) => r.playerId)
      expect(names).toContain(voter(9)) // from the open game
      expect(names).not.toContain(voter(5)) // only from the thin game
      expect(board.result.uncountedGames).toBe(1)
    })

    it('a selector enters a ballot as "entered by a selector", replacing their own without ever showing it', async () => {
      const first = await enterSelectorBallot(selector, openGame.id, [{ place: 1, playerId: voter(0) }, { place: 2, playerId: voter(1) }, { place: 3, playerId: voter(2) }])
      expect(first).toEqual({ ok: true })
      const again = await enterSelectorBallot(selector, openGame.id, [{ place: 1, playerId: voter(1) }, { place: 2, playerId: voter(0) }, { place: 3, playerId: voter(2) }])
      expect(again).toEqual({ ok: true })
      expect(await ballotCount(payload, openGame.id)).toBe(7)
      const detail = await loadVoteGame(selector, openGame.id)
      expect(detail!.myEntryExists).toBe(true)
      expect(detail!.game.enteredBySelector).toBe(1)
      expect(detail!.voted.filter((v) => v.entered)).toHaveLength(1)
      expect(JSON.stringify(detail)).not.toMatch(/picks|voterKey/)
      // a closed game refuses a selector entry until it is reopened
      expect(await enterSelectorBallot(selector, closedGame.id, [{ place: 1, playerId: voter(0) }, { place: 2, playerId: voter(1) }, { place: 3, playerId: voter(2) }])).toMatchObject({ ok: false })
    })

    it('chase list holds the players who have not voted', async () => {
      const detail = await loadVoteGame(selector, closedGame.id)
      expect(detail!.chase).toHaveLength(6)
      expect(detail!.chase.map((c) => c.id)).not.toContain(voter(3))
    })
  })

  describe('staff changes', () => {
    it('only admin and editor change settings; a selector and the unsigned are refused; bad values are refused', async () => {
      const good = { enabled: true, ballotValues: '5,3,1', voteWindowDays: 10, editWindowHours: 12, minBallotsToCount: 6, publicLeaderboard: false, publicScope: 'both', publicShowBreakdown: true }
      expect(await saveVoteSettings(selector, good)).toMatchObject({ ok: false })
      expect(await saveVoteSettings(editor, { ...good, ballotValues: '1,2,3' })).toMatchObject({ ok: false })
      expect(await saveVoteSettings(editor, { ...good, minBallotsToCount: 1 })).toMatchObject({ ok: false })
      expect(await saveVoteSettings(editor, good)).toMatchObject({ ok: true })
      const view = await loadVoteSettingsView(selector)
      expect(view.settings).toMatchObject({ ballotValues: [5, 3, 1], voteWindowDays: 10, minBallotsToCount: 6, publicScope: 'both' })
      expect(view.canEdit).toBe(false)
      expect((await loadVoteSettingsView(admin)).canEdit).toBe(true)
      await expect(saveVoteSettings(null as never, good)).rejects.toThrow()
    })

    it('the settings screen warns when players still use a last-4 PIN', async () => {
      await payload.create({ collection: 'player-selection-profiles', data: { player: voter(0), phone: '0400000001', pinSource: 'phone', pinHash: 'x', pinSalt: 'y' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      await payload.create({ collection: 'player-selection-profiles', data: { player: voter(1), phone: '0400000002', pinSource: 'manual', pinHash: 'x', pinSalt: 'y' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const view = await loadVoteSettingsView(editor)
      expect(view.defaultPinPlayers).toBe(1)
      expect(view.pinWarning).toMatch(/^1 player still uses/)
      const saved = await saveVoteSettings(editor, { enabled: true, ballotValues: '3,2,1', voteWindowDays: 7, editWindowHours: 24, minBallotsToCount: 5, publicScope: 'club' })
      expect(saved).toMatchObject({ ok: true, warning: expect.stringMatching(/last 4 digits/) })
    })

    it('only staff can open, close or exclude a game; a selector is refused and a bad value changes nothing', async () => {
      expect(await setGameVotes(selector, closedGame.id, { votesState: 'open' })).toMatchObject({ ok: false })
      expect((await loadVotesHome(selector)).games.find((g) => g.id === closedGame.id)!.status).not.toBe('open')
      expect(await setGameVotes(editor, closedGame.id, { votesState: 'open' })).toEqual({ ok: true })
      expect((await loadVotesHome(editor)).games.find((g) => g.id === closedGame.id)!.status).toBe('open')
      expect(await setGameVotes(editor, closedGame.id, { votesState: 'weird' })).toMatchObject({ ok: false })
      expect(await setGameVotes(editor, closedGame.id, { countsForAwards: 'no' })).toMatchObject({ ok: false })
      expect(await setGameVotes(selector, closedGame.id, { countsForAwards: false })).toMatchObject({ ok: false })
      expect(await setGameVotes(editor, closedGame.id, { countsForAwards: false })).toEqual({ ok: true })
      const pub = await getPublicBoard(payload, { locale: LOCALE })
      expect(pub!.result.rows).toEqual([])
    })

    it('the actions take the user from the session and ignore tampered fields', async () => {
      const actions = await import('@/app/(frontend)/selector/votes-actions')
      const fd = new FormData()
      for (const [k, v] of Object.entries({ enabled: 'on', ballotValues: '3,2,1', voteWindowDays: '7', editWindowHours: '24', minBallotsToCount: '5', publicScope: 'club', role: 'admin', userId: String(admin.id) })) fd.set(k, v)
      ctl.headers = new Headers({ Authorization: `JWT ${tokens.selector}` })
      expect(await actions.saveVoteSettingsAction({}, fd)).toMatchObject({ error: expect.stringMatching(/committee/) })
      ctl.headers = new Headers({ Authorization: `JWT ${tokens.editor}` })
      expect(await actions.saveVoteSettingsAction({}, fd)).toMatchObject({ ok: expect.stringMatching(/Saved/) })
      ctl.headers = new Headers()
      await expect(actions.saveVoteSettingsAction({}, fd)).rejects.toThrow(/REDIRECT/)
    })
  })

  describe('the public board', () => {
    it('is a plain 404 (null) when voting is off, when the public switch is off, and when the scope is not allowed', async () => {
      expect(await getPublicBoard(payload, { locale: LOCALE })).not.toBeNull()
      await settingsPatch(payload, { publicLeaderboard: false })
      expect(await getPublicBoard(payload, { locale: LOCALE })).toBeNull()
      expect(await publicLeaderboardOn(payload)).toBe(false)
      await settingsPatch(payload, { publicLeaderboard: true, enabled: false })
      expect(await getPublicBoard(payload, { locale: LOCALE })).toBeNull()
      await settingsPatch(payload, { enabled: true, publicScope: 'club' })
      const grade = (await getPublicBoard(payload, { locale: LOCALE }))!.grades[0].gradeId
      expect(await getPublicBoard(payload, { locale: LOCALE, gradeId: grade })).toBeNull()
      await settingsPatch(payload, { publicScope: 'grade' })
      expect(await getPublicBoard(payload, { locale: LOCALE })).toBeNull()
      expect(await getPublicBoard(payload, { locale: LOCALE, gradeId: grade })).not.toBeNull()
      // Grade-only scope: /votes redirects to a grade and stays out of the sitemap.
      expect(await firstPublicGradeId(payload)).toBe(grade)
      expect(await publicLeaderboardIndexable(payload)).toBe(false)
      await settingsPatch(payload, { publicScope: 'club' })
      expect(await firstPublicGradeId(payload)).toBeNull()
      expect(await publicLeaderboardIndexable(payload)).toBe(true)
    })

    it('holds only totals of closed games over the minimum, and counts the rest as "not counted yet"', async () => {
      const pub = (await getPublicBoard(payload, { locale: LOCALE }))!
      expect(pub.result.rows.map((r) => [r.playerId, r.points])).toEqual([[voter(0), 18], [voter(1), 12], [voter(2), 6]])
      expect(pub.result.countedGames).toBe(1)
      expect(pub.result.uncountedGames).toBe(2) // the thin game and the open one, without saying which
      expect(pub.result.rounds).toHaveLength(1)
    })

    it('does not move when a ballot is cast in the open game (the differencing test), nor when a thin game gets one more', async () => {
      const before = JSON.stringify(await getPublicBoard(payload, { locale: LOCALE }))
      await writeBallot(payload, { fixtureId: openGame.id, voterKey: `player:${voter(11)}`, voterPlayerId: voter(11), picks: [{ place: 1, playerId: voter(0) }, { place: 2, playerId: voter(1) }, { place: 3, playerId: voter(2) }], source: 'voter', castBy: null })
      expect(JSON.stringify(await getPublicBoard(payload, { locale: LOCALE }))).toBe(before)
    })

    it('a closed game appears once its window closes, whatever its ballot count', async () => {
      await setGameVotes(admin, openGame.id, { votesState: 'closed' })
      const pub = (await getPublicBoard(payload, { locale: LOCALE }))!
      expect(pub.result.rows.map((r) => r.playerId)).toContain(voter(9))
      expect(pub.result.countedGames).toBe(2)
    })

    it('hidden players are absent', async () => {
      await payload.update({ collection: 'players', id: voter(0), data: { hidden: true } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const pub = (await getPublicBoard(payload, { locale: LOCALE }))!
      expect(pub.result.rows.map((r) => r.playerId)).not.toContain(voter(0))
      expect(JSON.stringify(pub)).not.toContain(team[0].name)
    })

    it('the page renders the table, the values used and the uncounted line, and 404s when off', async () => {
      const { default: VotesPage } = await import('@/app/(frontend)/votes/page')
      const html = renderToStaticMarkup(await VotesPage({ searchParams: Promise.resolve({}) }))
      expect(html).toContain('Points 3-2-1')
      expect(html).toContain('2 games are not counted yet')
      expect(html).toContain(team[0].name)
      expect(html).not.toContain(team[9].name)
      await settingsPatch(payload, { publicLeaderboard: false })
      await expect(VotesPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: expect.stringContaining('404') })
    })
  })

  describe('no (voter, picks) pair is anywhere in what the area and the public receive', () => {
    it('home, game detail, boards, presenter snapshot, public board and the csv carry no ballot rows', async () => {
      const parts = [
        await loadVotesHome(admin),
        await loadVoteGame(admin, closedGame.id),
        await loadPrivateBoard(admin, { locale: LOCALE }),
        await loadPresentSnapshot(admin, { locale: LOCALE, title: 'Awards' }),
        await getPublicBoard(payload, { locale: LOCALE }),
        await computeBoard(payload, { audience: 'public', locale: LOCALE }),
        await auditVoters(admin, closedGame.id),
        await exportVotesCsv(admin, { locale: LOCALE }),
      ]
      const json = JSON.stringify(parts)
      expect(json).not.toMatch(/"picks"|voterKey|"castBy"|"voter":/)
      const snapshot = JSON.stringify((await loadPresentSnapshot(admin, { locale: LOCALE, title: 'Awards' })).snapshot)
      // the closed round only: nothing of the open game is in the presenter data
      expect(snapshot).not.toContain(team[9].name)
      expect(snapshot).not.toMatch(/per.?game|fixture/i)
    })
  })

  describe('csv export', () => {
    it('is admin only, holds season totals and the values used, and neutralises a formula in a name', async () => {
      expect(await exportVotesCsv(editor, { locale: LOCALE })).toBeNull()
      expect(await exportVotesCsv(selector, { locale: LOCALE })).toBeNull()
      await payload.update({ collection: 'players', id: voter(0), data: { firstName: '=HYPERLINK("http://x")', displayName: '=HYPERLINK("http://x")' } as never, overrideAccess: true, context: { disableRevalidate: true } })
      const out = (await exportVotesCsv(admin, { locale: LOCALE }))!
      expect(out.slug).toMatch(/^votes-\d{4}$/)
      expect(out.body.split('\r\n')[0]).toContain('Ballot values used')
      expect(out.body).toContain("'=HYPERLINK")
      expect(out.body).not.toMatch(/(^|,)=HYPERLINK/m)
      expect(out.body).toContain('3-2-1')
    })

    it('the route refuses anonymous, selector and editor callers and serves an admin', async () => {
      const { GET } = await import('@/app/api/admin/votes-export/route')
      const call = (token?: string) => GET(new Request('http://localhost:3000/api/admin/votes-export', { headers: token ? { Authorization: `JWT ${token}` } : {} }))
      expect((await call()).status).toBe(401)
      expect((await call(tokens.selector)).status).toBe(403)
      expect((await call(tokens.editor)).status).toBe(403)
      const ok = await call(tokens.admin)
      expect(ok.status).toBe(200)
      expect(ok.headers.get('content-type')).toMatch(/text\/csv/)
      expect(ok.headers.get('content-disposition')).toMatch(/attachment; filename="[a-z0-9-]+-votes-\d{4}\.csv"/)
    })
  })
})
