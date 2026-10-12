import type { Payload } from 'payload'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentSeasonStartYear } from '@/lib/selection/season'
import { clubToday } from '@/lib/selection-fixtures'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { addToSquad, makePlayer, makeSquad, resetSelection } from './selection-helpers'

const cache = vi.hoisted(() => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/cache', () => cache)
const ctl = vi.hoisted(() => ({ headers: new Headers() }))
vi.mock('next/headers', () => ({ headers: async () => ctl.headers, cookies: async () => ({ get: () => undefined, set: () => undefined }) }))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => '/selector/nets',
}))

type Row = { id: number; playerKey: string; player?: unknown; guestName?: string | null }

/** Net sessions: the whole selector flow, the access rules and the staff-only note (wave B spec 4.7, 4.9). */
describe('net sessions and the editable player card', () => {
  let payload: Payload
  const token = {} as Record<'admin' | 'editor' | 'selector' | 'selector2', string>
  const uid = {} as Record<'admin' | 'editor' | 'selector' | 'selector2', number>
  let team: { id: number; name: string }[]
  const as = (who: keyof typeof token | null) => {
    ctl.headers = who ? new Headers({ Authorization: `JWT ${token[who]}` }) : new Headers()
  }
  const q = () => import('@/lib/nets-queries')
  const actions = () => import('@/app/(frontend)/selector/nets-actions')
  const user = (who: keyof typeof uid, role: string) => ({ id: uid[who], role }) as never
  const attendance = async (sessionId?: number) => (await payload.find({ collection: 'net-attendance', where: sessionId ? { session: { equals: sessionId } } : {}, limit: 200, pagination: false, depth: 0, overrideAccess: true, sort: 'id' })).docs as unknown as Row[]
  async function session(over: Record<string, unknown> = {}, who: 'selector' | 'selector2' | 'editor' = 'selector') {
    const res = await (await q()).createSession(user(who, who === 'editor' ? 'editor' : 'selector'), { date: clubToday(), nets: 2, minutesPerTurn: 10, groupSize: 4, ...over })
    if (!res.ok) throw new Error(res.error)
    return res.id
  }
  let sel: never

  beforeAll(async () => {
    payload = await getTestPayload()
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    token.admin = await tokenFor(payload, 'admin')
    token.editor = await tokenFor(payload, 'editor')
    token.selector = await tokenFor(payload, 'selector')
    token.selector2 = await tokenFor(payload, 'selector', 'selector2@example.com')
    for (const [k, email] of [['admin', 'admin@example.com'], ['editor', 'editor@example.com'], ['selector', 'selector@example.com'], ['selector2', 'selector2@example.com']] as const) {
      uid[k] = (await payload.find({ collection: 'users', where: { email: { equals: email } }, depth: 0, limit: 1 })).docs[0].id
    }
    sel = user('selector', 'selector')
  })
  afterAll(async () => {
    await resetSelection(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await resetSelection(payload)
    as(null)
    team = []
    const squad = await makeSquad(payload, currentSeasonStartYear())
    for (let i = 1; i <= 9; i++) {
      const p = await makePlayer(payload, `Net${String(i).padStart(2, '0')}`, 'Tester')
      await addToSquad(payload, squad.id, p.id)
      team.push({ id: p.id, name: `Net${String(i).padStart(2, '0')} Tester` })
    }
  })

  it('every net action refuses an anonymous caller by sending them to sign in, and writes nothing', async () => {
    const a = await actions()
    const form = new FormData()
    form.set('date', clubToday())
    form.set('sessionId', '1')
    const calls: Array<() => Promise<unknown>> = [
      () => a.createSessionAction({}, form),
      () => a.updateSessionAction({}, form),
      () => a.deleteSessionAction(form),
      () => a.checkInAction({ sessionId: 1, playerId: team[0].id }),
      () => a.checkOutAction({ sessionId: 1, key: `player:${team[0].id}` }),
      () => a.addGuestAction({ sessionId: 1, name: 'Guest' }),
      () => a.searchPlayersAction({ q: 'Net' }),
      () => a.buildRotationAction({ sessionId: 1 }),
      () => a.startSessionAction({ sessionId: 1 }),
      () => a.pauseSessionAction({ sessionId: 1 }),
      () => a.resumeSessionAction({ sessionId: 1 }),
      () => a.nextRoundAction({ sessionId: 1 }),
      () => a.finishSessionAction({ sessionId: 1 }),
    ]
    for (const call of calls) await expect(call()).rejects.toThrow(/NEXT_REDIRECT \/selector\/login/)
    expect((await payload.count({ collection: 'net-sessions', overrideAccess: true })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'net-attendance', overrideAccess: true })).totalDocs).toBe(0)
  })

  it('a selector runs a whole session: create, check in, build, start, pause, resume, next round, finish', async () => {
    const a = await actions()
    as('selector')
    const form = new FormData()
    form.set('title', 'Tuesday nets')
    form.set('date', clubToday())
    form.set('nets', '1')
    form.set('minutesPerTurn', '10')
    form.set('groupSize', '4')
    form.set('createdBy', '99999') // ignored: it comes from the session
    let id = 0
    await a.createSessionAction({}, form).catch((e: Error) => {
      id = Number(/\/selector\/nets\/(\d+)/.exec(e.message)![1])
    })
    const created = (await payload.findByID({ collection: 'net-sessions', id, depth: 0, overrideAccess: true })) as unknown as { createdBy: number; state: string; nets: number }
    expect(created).toMatchObject({ createdBy: uid.selector, state: 'planned', nets: 1 })

    for (const p of team.slice(0, 8)) expect(await a.checkInAction({ sessionId: id, playerId: p.id })).toEqual({ ok: true })
    expect(await a.addGuestAction({ sessionId: id, name: 'Visiting Vic' })).toEqual({ ok: true })
    expect(await attendance(id)).toHaveLength(9)
    expect(await a.startSessionAction({ sessionId: id })).toMatchObject({ ok: false, error: 'Build the rotation first.' })

    const built = await a.buildRotationAction({ sessionId: id })
    expect(built.ok && built.snapshot.plan!.groups.map((g) => g.players.length)).toEqual([3, 3, 3])
    const started = await a.startSessionAction({ sessionId: id })
    expect(started).toMatchObject({ ok: true, snapshot: { state: 'running', round: 0 } })
    expect(await a.buildRotationAction({ sessionId: id })).toMatchObject({ ok: false })

    const paused = await a.pauseSessionAction({ sessionId: id })
    expect(paused).toMatchObject({ ok: true, snapshot: { state: 'paused' } })
    expect(paused.ok && paused.snapshot.revision).toBeGreaterThan(started.ok ? started.snapshot.revision : 99)

    // A second selector's phone reads the same paused state.
    as('selector2')
    const snap2 = await (await q()).getNetSnapshot(user('selector2', 'selector'), id)
    expect(snap2).toMatchObject({ state: 'paused', revision: paused.ok ? paused.snapshot.revision : -1 })

    expect(await a.resumeSessionAction({ sessionId: id })).toMatchObject({ ok: true, snapshot: { state: 'running' } })
    expect(await a.nextRoundAction({ sessionId: id })).toMatchObject({ ok: true, snapshot: { round: 1 } })
    expect(await a.nextRoundAction({ sessionId: id })).toMatchObject({ ok: true, snapshot: { round: 2 } })
    expect(await a.nextRoundAction({ sessionId: id })).toMatchObject({ ok: false, error: 'That was the last round. Finish the session.' })
    const done = await a.finishSessionAction({ sessionId: id })
    expect(done).toMatchObject({ ok: true, snapshot: { state: 'finished' } })
    expect(await a.finishSessionAction({ sessionId: id })).toMatchObject({ ok: false })
    expect(await a.updateSessionAction({}, Object.assign(new FormData(), {}) as FormData)).toMatchObject({ error: 'Something went wrong. Please try again.' })
  })

  it('check-in is idempotent under parallel taps (one row per session and person)', async () => {
    const id = await session()
    const { checkIn } = await q()
    const results = await Promise.all(Array.from({ length: 6 }, () => checkIn(sel, id, team[0].id)))
    expect(results.every((r) => r.ok)).toBe(true)
    const rows = await attendance(id)
    expect(rows).toHaveLength(1)
    expect(rows[0].playerKey).toBe(`player:${team[0].id}`)
    // The same player in another session is a separate row.
    const other = await session()
    await checkIn(sel, other, team[0].id)
    expect(await attendance()).toHaveLength(2)
    // An unknown player or session is refused, not stored.
    expect(await checkIn(sel, id, 99_999_999)).toMatchObject({ ok: false })
    expect(await checkIn(sel, 99_999_999, team[1].id)).toMatchObject({ ok: false })
  })

  it('guest names are cleaned, escaped on render, capped at ten and removable', async () => {
    const id = await session()
    const { addGuest, checkOut, getNetDetail } = await q()
    expect(await addGuest(sel, id, '=HYPERLINK("http://x")')).toEqual({ ok: true })
    expect(await addGuest(sel, id, '<img src=x onerror=alert(1)>')).toEqual({ ok: true })
    expect(await addGuest(sel, id, '   ')).toMatchObject({ ok: false })
    expect(await addGuest(sel, id, 'a'.repeat(100))).toEqual({ ok: true })
    const names = (await attendance(id)).map((r) => r.guestName)
    expect(names[0]).toBe('HYPERLINK("http://x")')
    expect(names.every((n) => !n || (n.length <= 40 && !/^[=+\-@\t]/.test(n)))).toBe(true)
    expect(await addGuest(sel, id, 'hyperlink("http://x")')).toEqual({ ok: true }) // same name again is the same guest
    expect(await attendance(id)).toHaveLength(3)
    for (let i = 0; i < 7; i++) expect(await addGuest(sel, id, `Guest ${i}`)).toEqual({ ok: true })
    expect(await addGuest(sel, id, 'One too many')).toMatchObject({ ok: false })
    const detail = (await getNetDetail(sel, id))!
    expect(detail.guestsLeft).toBe(0)
    const { CheckIn } = await import('@/components/nets/check-in')
    const { createElement } = await import('react')
    const html = renderToStaticMarkup(createElement(CheckIn, { sessionId: id, squad: detail.squad, others: detail.others, guestsLeft: 0, actions: {} as never }))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(await checkOut(sel, id, detail.others[0].key)).toEqual({ ok: true })
    expect((await attendance(id)).length).toBe(9)
  })

  it('a late check-in joins a later round; a started round and a check-out of a current player change nothing', async () => {
    const id = await session({ nets: 1, groupSize: 4 })
    const { checkIn, checkOut, buildSessionRotation, startSession, getNetSnapshot } = await q()
    for (const p of team.slice(0, 6)) await checkIn(sel, id, p.id)
    await buildSessionRotation(sel, id)
    await startSession(sel, id)
    const before = (await getNetSnapshot(sel, id))!.plan!
    expect(before.groups).toHaveLength(2)
    await checkIn(sel, id, team[6].id)
    const after = (await getNetSnapshot(sel, id))!.plan!
    expect(after.groups[0].players).toEqual(before.groups[0].players) // round 1 is untouched
    expect(after.groups[1].players.map((p) => p.key)).toContain(`player:${team[6].id}`)
    await checkOut(sel, id, `player:${team[0].id}`) // already up in round 1: stays in the plan
    expect((await getNetSnapshot(sel, id))!.plan!.groups[0].players.map((p) => p.key)).toContain(`player:${team[0].id}`)
    await checkOut(sel, id, `player:${team[6].id}`)
    expect((await getNetSnapshot(sel, id))!.plan!.groups.flatMap((g) => g.players.map((p) => p.key))).not.toContain(`player:${team[6].id}`)
  })

  it('two selectors acting at once: one wins and revision only moves forward (no lost update)', async () => {
    const id = await session({ nets: 1, groupSize: 2 })
    const { checkIn, buildSessionRotation, startSession, pauseSession, resumeSession, nextRound, getNetSnapshot } = await q()
    for (const p of team.slice(0, 4)) await checkIn(sel, id, p.id)
    await buildSessionRotation(sel, id)
    await startSession(sel, id)
    const [a, b] = await Promise.all([pauseSession(sel, id), pauseSession(user('selector2', 'selector'), id)])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    await resumeSession(sel, id)
    const rev = (await getNetSnapshot(sel, id))!.revision
    const results = await Promise.all([nextRound(sel, id), nextRound(user('selector2', 'selector'), id)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const now = (await getNetSnapshot(sel, id))!
    expect(now.revision).toBeGreaterThan(rev)
    expect(now.round).toBe(1)
  })

  it('editing is only before the start; deleting needs ownership (a selector) or the committee', async () => {
    const { updateSession, deleteSession, checkIn, buildSessionRotation, startSession } = await q()
    const mine = await session()
    expect(await updateSession(sel, mine, { date: clubToday(), nets: 5 })).toEqual({ ok: true })
    expect(await updateSession(sel, mine, { date: clubToday(), nets: 50 })).toMatchObject({ ok: false })
    expect((await payload.findByID({ collection: 'net-sessions', id: mine, depth: 0, overrideAccess: true })).nets).toBe(5)
    expect(await deleteSession(user('selector2', 'selector'), mine)).toMatchObject({ ok: false })
    expect(await deleteSession(user('editor', 'editor'), mine)).toEqual({ ok: true })
    const started = await session()
    await checkIn(sel, started, team[0].id)
    await buildSessionRotation(sel, started)
    await startSession(sel, started)
    expect(await updateSession(sel, started, { date: clubToday() })).toMatchObject({ ok: false })
    expect(await deleteSession(sel, started)).toMatchObject({ ok: false })
    const own = await session()
    await checkIn(sel, own, team[1].id)
    expect(await deleteSession(sel, own)).toEqual({ ok: true })
    expect(await attendance(own)).toHaveLength(0)
  })

  it('Start is refused while the rotation differs from the check-ins', async () => {
    const { checkIn, checkOut, buildSessionRotation, startSession } = await q()
    const id = await session()
    await checkIn(sel, id, team[0].id)
    await checkIn(sel, id, team[1].id)
    await buildSessionRotation(sel, id)
    await checkIn(sel, id, team[2].id)
    expect(await startSession(sel, id)).toMatchObject({ ok: false, error: expect.stringContaining('Build the rotation again') })
    await buildSessionRotation(sel, id)
    await checkOut(sel, id, `player:${team[2].id}`)
    expect(await startSession(sel, id)).toMatchObject({ ok: false })
    await buildSessionRotation(sel, id)
    expect(await startSession(sel, id)).toMatchObject({ ok: true })
  })

  it('deleting a session or a player from the admin or REST removes their check-ins', async () => {
    const { checkIn, addGuest } = await q()
    const id = await session()
    await checkIn(sel, id, team[0].id)
    await addGuest(sel, id, 'Visiting Vic')
    await payload.delete({ collection: 'net-sessions', id, overrideAccess: true })
    expect(await attendance(id)).toHaveLength(0)
    const other = await session()
    const pl = await makePlayer(payload, 'Doomed', 'Player')
    await checkIn(sel, other, pl.id)
    await payload.delete({ collection: 'players', id: pl.id, overrideAccess: true })
    expect((await attendance(other)).some((r) => r.playerKey === `player:${pl.id}`)).toBe(false)
  })

  it('the state route: 404 to anonymous and unknown ids, no-store JSON to a selector', async () => {
    const id = await session()
    const { GET } = await import('@/app/(frontend)/selector/(area)/nets/[id]/state/route')
    const call = (headers: Record<string, string>, rid: string) => GET(new Request(`http://localhost:3000/selector/nets/${rid}/state`, { headers }), { params: Promise.resolve({ id: rid }) })
    expect((await call({}, String(id))).status).toBe(404)
    const ok = await call({ Authorization: `JWT ${token.selector}` }, String(id))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Cache-Control')).toMatch(/no-store/)
    const body = await ok.json()
    expect(body).toMatchObject({ id, state: 'planned', nets: 2 })
    expect(typeof body.serverNow).toBe('number')
    expect((await call({ Authorization: `JWT ${token.selector}` }, '99999999')).status).toBe(404)
    expect((await call({ Authorization: `JWT ${token.selector}` }, 'abc')).status).toBe(404)
  })

  it('net collections are staff-only over REST: anonymous and selectors are refused, an editor can read', async () => {
    const id = await session()
    await (await q()).checkIn(sel, id, team[0].id)
    for (const path of ['/net-sessions', '/net-attendance', `/net-attendance?where[playerKey][like]=player`]) {
      expect((await rest('GET', path)).status, path).toBe(403)
      expect((await rest('GET', path, { token: token.selector })).status, path).toBe(403)
      expect((await rest('GET', path, { token: token.editor })).status, path).toBe(200)
    }
    expect((await rest('POST', '/net-sessions', { token: token.selector, body: { title: 'x', date: clubToday() } })).status).toBe(403)
    expect((await rest('GET', '/net-sessions', { token: token.editor })).json.docs[0].rotationPlan).toBeUndefined()
  })

  describe('the player card', () => {
    const profiles = () => import('@/lib/selector-profile-queries')
    const form = (data: Record<string, string>) => {
      const f = new FormData()
      for (const [k, v] of Object.entries(data)) f.set(k, v)
      return f
    }

    it('role, styles and can-keep round-trip, and an unknown option is rejected rather than coerced', async () => {
      const { saveSelectorFields, getProfile } = await profiles()
      const pid = team[0].id
      expect(await saveSelectorFields(sel, pid, { role: 'all-rounder', canKeep: 'on', battingStyle: 'left-hand', bowlingStyle: 'right-arm off-break' })).toEqual({ ok: true })
      expect(await getProfile(sel, pid)).toMatchObject({ role: 'all-rounder', canKeep: true, battingStyle: 'left-hand', bowlingStyle: 'right-arm off-break' })
      expect(await saveSelectorFields(sel, pid, { bowlingStyle: 'left-arm' })).toMatchObject({ ok: false })
      expect(await saveSelectorFields(sel, pid, { role: 'goalie' })).toMatchObject({ ok: false })
      expect(await getProfile(sel, pid)).toMatchObject({ role: 'all-rounder', bowlingStyle: 'right-arm off-break' })
      // A section that sends only notes leaves the cricket fields alone.
      expect(await saveSelectorFields(sel, pid, { notes: 'Calm under pressure' })).toEqual({ ok: true })
      expect(await getProfile(sel, pid)).toMatchObject({ role: 'all-rounder', canKeep: true, notes: 'Calm under pressure' })
    })

    it('a staff-only note is hidden from selectors and cannot be changed or unticked by one, even with a hand-posted form', async () => {
      const { saveSelectorFields, getProfile, profilesForPlayers } = await profiles()
      const pid = team[1].id
      const editor = user('editor', 'editor')
      expect(await saveSelectorFields(editor, pid, { notes: 'Private matter', notesStaffOnly: 'on' })).toEqual({ ok: true })
      // Editor reads it.
      expect(await getProfile(editor, pid)).toMatchObject({ notes: 'Private matter', notesStaffOnly: true, hasStaffNote: false })
      // The selector (Local API with the access override, as the pages use it) gets nothing.
      const seen = await getProfile(sel, pid)
      expect(seen).toMatchObject({ notes: '', hasStaffNote: true, notesStaffOnly: true })
      // A flagged but empty note is not editable by a selector either (the form is hidden, so Save cannot fail oddly).
      expect(await saveSelectorFields(editor, team[3].id, { notes: '', notesStaffOnly: 'on' })).toEqual({ ok: true })
      expect(await getProfile(sel, team[3].id)).toMatchObject({ hasStaffNote: true })
      expect(JSON.stringify(await profilesForPlayers(sel, [pid]).then((m) => [...m.values()]))).not.toContain('Private matter')
      // Hand-posted edits are refused and the row is unchanged.
      expect(await saveSelectorFields(sel, pid, { notes: 'overwritten' })).toMatchObject({ ok: false })
      expect(await saveSelectorFields(sel, pid, { notesStaffOnly: false })).toMatchObject({ ok: false })
      expect(await saveSelectorFields(sel, pid, { notes: 'x', notesStaffOnly: false })).toMatchObject({ ok: false })
      const raw = (await payload.find({ collection: 'player-selection-profiles', where: { player: { equals: pid } }, depth: 0, overrideAccess: true })).docs[0]
      expect(raw).toMatchObject({ notes: 'Private matter', notesStaffOnly: true })
      // A selector cannot make a note staff-only either.
      expect(await saveSelectorFields(sel, team[2].id, { notes: 'mine', notesStaffOnly: 'on' })).toMatchObject({ ok: false })
      // The same through the server action with the real session.
      const a = await import('@/app/(frontend)/selector/board-actions')
      as('selector')
      const res = await a.saveNotesAction({}, form({ playerId: String(pid), notes: 'hacked', notesStaffOnly: '', hasStaffTick: '1' }))
      expect(res.error).toBeTruthy()
      as('editor')
      expect(await a.saveNotesAction({}, form({ playerId: String(pid), notes: 'Updated by editor', notesStaffOnly: 'on', hasStaffTick: '1' }))).toEqual({ ok: 'Saved.' })
      expect((await getProfile(editor, pid)).notes).toBe('Updated by editor')
      // An editor can untick it, and then the selector sees it again.
      expect(await saveSelectorFields(editor, pid, { notesStaffOnly: false })).toEqual({ ok: true })
      expect((await getProfile(sel, pid)).notes).toBe('Updated by editor')
    })

    it('REST: a selector cannot read or probe profiles; an editor can read and write; the tick is staff-only at field level', async () => {
      const { saveSelectorFields } = await profiles()
      await saveSelectorFields(user('editor', 'editor'), team[3].id, { notes: 'secret', notesStaffOnly: 'on', battingStyle: 'right-hand' })
      for (const path of ['/player-selection-profiles', '/player-selection-profiles?where[notesStaffOnly][equals]=true', '/player-selection-profiles?where[battingStyle][equals]=right-hand']) {
        expect((await rest('GET', path)).status, path).toBe(403)
        expect((await rest('GET', path, { token: token.selector })).status, path).toBe(403)
      }
      const ed = await rest('GET', '/player-selection-profiles?where[notesStaffOnly][equals]=true', { token: token.editor })
      expect(ed.status).toBe(200)
      expect(ed.json.docs[0]).toMatchObject({ notes: 'secret', notesStaffOnly: true, battingStyle: 'right-hand' })
      expect(ed.json.docs[0].pinHash).toBeUndefined()
      const patch = await rest('PATCH', `/player-selection-profiles/${ed.json.docs[0].id}`, { token: token.editor, body: { bowlingStyle: 'left-arm fast' } })
      expect(patch.status).toBe(200)
      expect((await rest('PATCH', `/player-selection-profiles/${ed.json.docs[0].id}`, { token: token.selector, body: { notesStaffOnly: false } })).status).toBe(403)
    })

    it('the card shows "turned up at N of M" with the window, a dot per session, and nothing public', async () => {
      const { createSession, checkIn, buildSessionRotation, startSession, finishSession, playerNetsSummary } = await q()
      const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10)
      const ids: number[] = []
      for (const back of [3, 10, 17]) {
        const r = await createSession(sel, { date: day(back) })
        if (!r.ok) throw new Error(r.error)
        ids.push(r.id)
        await checkIn(sel, r.id, team[5].id === 0 ? team[6].id : team[6].id)
        if (back !== 17) await checkIn(sel, r.id, team[7].id)
        await buildSessionRotation(sel, r.id)
        await startSession(sel, r.id)
        await finishSession(sel, r.id)
      }
      await createSession(sel, { date: day(-4) }) // planned, in the future: not counted
      const regular = await playerNetsSummary(sel, team[6].id)
      const sometimes = await playerNetsSummary(sel, team[7].id)
      const never = await playerNetsSummary(sel, team[8].id)
      expect(regular).toMatchObject({ held: 3, attended: 3, weeks: 8 })
      expect(sometimes).toMatchObject({ held: 3, attended: 2 })
      expect(never).toMatchObject({ held: 3, attended: 0, lastDate: null })
      expect(sometimes.dots.map((d) => d.present)).toEqual([true, true, false])
      const page = (await import('@/app/(frontend)/selector/(area)/players/[slug]/page')).default
      as('selector')
      const slug = (await payload.findByID({ collection: 'players', id: team[7].id, depth: 0, overrideAccess: true })).slug
      const html = renderToStaticMarkup(await page({ params: Promise.resolve({ slug: slug! }) }))
      expect(html).toContain('Turned up at 2 of 3 net sessions in the last 8 weeks')
      expect(html).toContain('Present')
      expect(html).toContain('Absent')
      expect(html).toContain('not a rating')
      expect(html).not.toMatch(/\d+%/)
      expect(html).not.toMatch(/vote/i)
      // Anonymous visitors are sent to sign in.
      as(null)
      await expect(page({ params: Promise.resolve({ slug: slug! }) })).rejects.toThrow(/NEXT_REDIRECT \/selector\/login/)
    })

    it('the card hides a committee note from a selector with a plain line, and gives an editor the tick', async () => {
      const { saveSelectorFields } = await profiles()
      await saveSelectorFields(user('editor', 'editor'), team[4].id, { notes: 'Do not repeat this', notesStaffOnly: 'on' })
      const page = (await import('@/app/(frontend)/selector/(area)/players/[slug]/page')).default
      const slug = (await payload.findByID({ collection: 'players', id: team[4].id, depth: 0, overrideAccess: true })).slug!
      as('selector')
      const forSelector = renderToStaticMarkup(await page({ params: Promise.resolve({ slug }) }))
      expect(forSelector).toContain('A committee note exists')
      expect(forSelector).not.toContain('Do not repeat this')
      expect(forSelector).not.toContain('notesStaffOnly')
      as('editor')
      const forEditor = renderToStaticMarkup(await page({ params: Promise.resolve({ slug }) }))
      expect(forEditor).toContain('Do not repeat this')
      expect(forEditor).toContain('name="notesStaffOnly"')
      expect(forEditor).toContain('Staff only')
    })
  })

  it('the nets pages render for a selector, list sessions, and send anonymous visitors to sign in', async () => {
    const id = await session({ title: 'Wed nets' })
    await (await q()).checkIn(sel, id, team[0].id)
    const list = (await import('@/app/(frontend)/selector/(area)/nets/page')).default
    const detail = (await import('@/app/(frontend)/selector/(area)/nets/[id]/page')).default
    await expect(list()).rejects.toThrow(/NEXT_REDIRECT \/selector\/login/)
    await expect(detail({ params: Promise.resolve({ id: String(id) }) })).rejects.toThrow(/NEXT_REDIRECT \/selector\/login/)
    as('selector')
    const listHtml = renderToStaticMarkup(await list())
    expect(listHtml).toContain('Wed nets')
    expect(listHtml).toContain('1 turned up')
    expect(listHtml).toContain('New session')
    const html = renderToStaticMarkup(await detail({ params: Promise.resolve({ id: String(id) }) }))
    expect(html).toContain('Check in')
    expect(html).toContain(team[0].name)
    expect(html).toContain('Summary')
    await expect(detail({ params: Promise.resolve({ id: '99999999' }) })).rejects.toThrow(/NEXT_NOT_FOUND/)
    // The Overview shows tonight's session.
    const home = (await import('@/app/(frontend)/selector/(area)/page')).default
    const homeHtml = renderToStaticMarkup(await home({ searchParams: Promise.resolve({}) }))
    expect(homeHtml).toContain('Nets tonight')
  })
})
