import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { resetPlayers } from './players-helpers'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * Membership tiers and the match-fee ledger (wave D WP-2) against real Postgres: the rate freeze, the open-season derivation from
 * stored games, recording and voiding, the transaction around a split, closing a season, the routes and the CSV. Nothing leaves the
 * machine.
 */
const ORIGIN = 'http://localhost:3000'
const SEASON = '2026/27'
const NEXT = '2027/28'

describe('membership fees', () => {
  let payload: Payload
  const tok: Record<string, string> = {}
  const user: Record<string, never> = {} as never
  let tierPlay: number
  let tierJunior: number

  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } }) as Promise<{ id: number } & Record<string, unknown>>
  const player = (n: string) => create('players', { firstName: n, lastName: 'Player', displayName: `${n} Player`, slug: `${n.toLowerCase()}-fee-player` })
  const member = (data: Record<string, unknown>) => create('members', { roles: ['player'], ...data })
  const game = async (n: number, date: string, players: { id: number; fillIn?: boolean }[], season = SEASON) => {
    const m = await create('matches', { gameId: `g${n}`, status: 'FINAL', seasonName: season, seasonStartYear: Number(season.slice(0, 4)), localDate: date, roundName: `Round ${n}`, roundAbbr: `R${n}`, opponentName: 'Rivals' })
    for (const [i, p] of players.entries()) await create('match-appearances', { match: m.id, appearanceId: `a${n}-${i}`, isClubSide: true, player: p.id, isFillIn: p.fillIn === true })
    return m
  }
  const join = (memberId: number, tier: number, season = SEASON) => create('memberships', { member: memberId, season, tier })
  const reset = async () => {
    for (const c of ['fee-payments', 'fee-waivers', 'fee-charges', 'fee-seasons', 'memberships', 'membership-tiers', 'members', 'office-audit-log'] as const) await clearCollection(payload, c)
    await resetPlayers(payload)
    tierPlay = (await create('membership-tiers', { season: SEASON, name: 'Pay as you play', kind: 'per-match', perMatchCents: 1000 })).id
    tierJunior = (await create('membership-tiers', { season: SEASON, name: 'Junior', kind: 'upfront', upfrontCents: 6000 })).id
  }
  const post = async (action: string, opts: { token?: string; origin?: string | null; form?: Record<string, string | string[]> } = {}) => {
    const body = new FormData()
    for (const [k, v] of Object.entries(opts.form ?? {})) for (const item of Array.isArray(v) ? v : [v]) body.append(k, item)
    const headers: Record<string, string> = {}
    if (opts.token) headers.Authorization = `JWT ${opts.token}`
    if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
    const request = new Request(`${ORIGIN}/api/admin/office/fees/${action}`, { method: 'POST', headers, body })
    const mod = await import('@/app/api/admin/office/fees/[action]/route')
    return mod.POST(request, { params: Promise.resolve({ action }) })
  }
  const report = async (season = SEASON) => {
    const { getFeesPage } = await import('@/lib/fees-office-queries')
    return (await getFeesPage(user.admin, season))!.report
  }
  const row = async (name: string, season = SEASON) => (await report(season)).rows.find((r) => r.name === name)!
  /** The validation message a rejected write carries (Payload wraps it in a generic sentence). */
  const why = async (p: PromiseLike<unknown>): Promise<string> => {
    try {
      await p
      return ''
    } catch (e) {
      return JSON.stringify((e as { data?: unknown }).data ?? (e as Error).message)
    }
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) {
      tok[role] = await tokenFor(payload, role)
      const found = await payload.find({ collection: 'users', where: { email: { equals: `${role}@example.com` } }, limit: 1, depth: 0, overrideAccess: true })
      user[role] = { ...(found.docs[0] as object), collection: 'users' } as never
    }
  }, 120_000)
  afterAll(async () => {
    await reset().catch(() => undefined)
    for (const c of ['fee-payments', 'fee-waivers', 'fee-charges', 'fee-seasons', 'memberships', 'membership-tiers', 'members', 'office-audit-log'] as const) await clearCollection(payload, c)
    await resetPlayers(payload)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(reset)

  describe('tiers and memberships', () => {
    it('freezes a tier rate once a membership uses it, still allows a rename, and refuses to delete a tier in use', async () => {
      const m = await member({ firstName: 'Fixed', lastName: 'Rate' })
      await expect(payload.update({ collection: 'membership-tiers', id: tierPlay, data: { perMatchCents: 1500 }, overrideAccess: true })).resolves.toBeTruthy()
      await join(m.id, tierPlay)
      expect(await why(payload.update({ collection: 'membership-tiers', id: tierPlay, data: { perMatchCents: 2000 }, overrideAccess: true }))).toMatch(/This rate is in use/)
      expect(await why(payload.update({ collection: 'membership-tiers', id: tierPlay, data: { upfrontCents: 5 }, overrideAccess: true }))).toMatch(/This rate is in use/)
      await expect(payload.update({ collection: 'membership-tiers', id: tierPlay, data: { name: 'Renamed', active: false }, overrideAccess: true })).resolves.toMatchObject({ name: 'Renamed' })
      await expect(payload.delete({ collection: 'membership-tiers', id: tierPlay, overrideAccess: true })).rejects.toThrow()
    })

    it('copies the rates onto the membership, keeps one per member per season and matches the tier season', async () => {
      const m = await member({ firstName: 'Snap', lastName: 'Shot' })
      const ms = await join(m.id, tierPlay)
      expect(ms).toMatchObject({ perMatchCentsSnapshot: 1000, upfrontCentsSnapshot: 0 })
      await expect(join(m.id, tierJunior)).rejects.toThrow()
      const other = (await create('membership-tiers', { season: NEXT, name: 'Next', kind: 'free' })).id
      expect(await why(join((await member({ firstName: 'Wrong', lastName: 'Season' })).id, other))).toMatch(/different season/)
      expect((await create('membership-tiers', { season: NEXT, name: 'Free for all', kind: 'free', upfrontCents: 500, perMatchCents: 500 })).upfrontCents).toBe(0)
    })

    it('a member with fee records cannot be deleted, a member without can', async () => {
      const kept = await member({ firstName: 'Has', lastName: 'Records' })
      await join(kept.id, tierPlay)
      expect(await why(payload.delete({ collection: 'members', id: kept.id, overrideAccess: true }))).toMatch(/fee records/)
      const free = await member({ firstName: 'No', lastName: 'Records' })
      await expect(payload.delete({ collection: 'members', id: free.id, overrideAccess: true })).resolves.toBeTruthy()
    })

    it('refuses card numbers and a malformed season', async () => {
      await expect(create('membership-tiers', { season: 'nope', name: 'X', kind: 'free' })).rejects.toThrow()
      const m = await member({ firstName: 'Card', lastName: 'Check' })
      await expect(create('memberships', { member: m.id, season: SEASON, tier: tierPlay, note: '4111 1111 1111 1111' })).rejects.toThrow()
    })
  })

  describe('open season, from stored games', () => {
    it('charges each game a linked player played, flips the oldest to paid on a payment, and re-derives after a void', async () => {
      const p = await player('Ann')
      const m = await member({ firstName: 'Ann', lastName: 'Player', player: p.id })
      await join(m.id, tierPlay)
      await game(1, '2026-10-03', [{ id: p.id }])
      await game(2, '2026-10-10', [{ id: p.id }])
      await game(3, '2026-10-17', [{ id: p.id }])
      let r = await row('Ann Player')
      expect(r).toMatchObject({ payableCents: 3000, paidCents: 0, owedCents: 3000 })
      const { recordPayment, voidPayment, getMemberLedger } = await import('@/lib/fees-office-queries')
      const out = await recordPayment(user.admin, { memberId: m.id, amount: '20', receivedOn: '2026-08-01', method: 'cash', reference: '', note: '', payerId: '', target: '', splitIds: [], splitShares: [] })
      expect(out).toEqual({ ok: true, notice: 'paid' })
      r = await row('Ann Player')
      expect(r).toMatchObject({ paidCents: 2000, owedCents: 1000 })
      const ledger = await getMemberLedger(user.admin, m.id)
      expect(ledger!.allocation.lines.map((l) => l.status)).toEqual(['paid', 'paid', 'owing'])
      const payId = Number(ledger!.payments[0].id)
      expect(await voidPayment(user.admin, { id: payId, reason: 'Entered twice' })).toEqual({ ok: true, notice: 'voided' })
      expect(await row('Ann Player')).toMatchObject({ paidCents: 0, owedCents: 3000 })
      expect(await voidPayment(user.admin, { id: payId, reason: 'again' })).toMatchObject({ ok: false })
    })

    it('counts unmatched club appearances and appearances missing from the store, and flags the open season incomplete', async () => {
      const p = await player('Gap')
      const m = await member({ firstName: 'Gap', lastName: 'Player', player: p.id })
      await join(m.id, tierPlay)
      await game(1, '2026-10-03', [{ id: p.id }])
      const g = await create('matches', { gameId: 'g9', status: 'FINAL', seasonName: SEASON, seasonStartYear: 2026, localDate: '2026-10-24', roundName: 'R9' })
      await create('match-appearances', { match: g.id, appearanceId: 'x1', isClubSide: true, displayName: 'Nobody Known' })
      await payload.db.drizzle.execute(sql`INSERT INTO "payload"."player_seasons" (player_id, season_name, season_order, team_id, team_name, games, season_start_year, updated_at, created_at) VALUES (${p.id}, '2026/27', 1, 't1', 'Team', 3, 2026, now(), now())`)
      const r = await report()
      expect(r.unmatchedAppearances).toBe(1)
      expect(r.missingFromStore).toBe(2)
      expect(r.incomplete).toBe(true)
    })

    it('a fill-in is charged only when registered or when the club setting is on', async () => {
      const p = await player('Fill')
      const m = await member({ firstName: 'Fill', lastName: 'Player', player: p.id })
      await join(m.id, tierPlay)
      await game(1, '2026-10-03', [{ id: p.id, fillIn: true }])
      expect((await row('Fill Player')).payableCents).toBe(0)
      await payload.updateGlobal({ slug: 'office-settings', data: { chargeFillIns: true }, overrideAccess: true })
      expect((await row('Fill Player')).payableCents).toBe(1000)
      await payload.updateGlobal({ slug: 'office-settings', data: { chargeFillIns: false }, overrideAccess: true })
    })

    it('a targeted payment for the new season leaves the old arrears owing', async () => {
      const p = await player('Arrears')
      const m = await member({ firstName: 'Arrears', lastName: 'Player', player: p.id })
      await join(m.id, tierPlay)
      await game(1, '2026-10-03', [{ id: p.id }])
      const next = (await create('membership-tiers', { season: NEXT, name: 'Next season', kind: 'upfront', upfrontCents: 5000 })).id
      await join(m.id, next, NEXT)
      const { recordPayment } = await import('@/lib/fees-office-queries')
      await recordPayment(user.admin, { memberId: m.id, amount: '50', receivedOn: '2026-09-01', method: 'bank-transfer', reference: 'EFT 1', note: '', payerId: '', target: `season:${NEXT}`, splitIds: [], splitShares: [] })
      expect(await row('Arrears Player', SEASON)).toMatchObject({ owedCents: 1000 })
      expect(await row('Arrears Player', NEXT)).toMatchObject({ owedCents: 0, paidSpecificCents: 5000 })
    })
  })

  describe('payments and waivers', () => {
    it('rejects non-admins, bad amounts, future dates and card numbers, and writes nothing', async () => {
      const m = await member({ firstName: 'Bad', lastName: 'Input' })
      const { recordPayment } = await import('@/lib/fees-office-queries')
      const ok = { memberId: m.id, amount: '20', receivedOn: '2026-08-01', method: 'cash', reference: '', note: '', payerId: '', target: '', splitIds: [], splitShares: [] }
      expect(await recordPayment(user.editor, ok)).toEqual({ ok: false, code: 'forbidden' })
      expect(await recordPayment(user.selector, ok)).toEqual({ ok: false, code: 'forbidden' })
      expect(await recordPayment(undefined, ok)).toEqual({ ok: false, code: 'forbidden' })
      expect(await recordPayment(user.admin, { ...ok, amount: '-1' })).toEqual({ ok: false, code: 'amount' })
      expect(await recordPayment(user.admin, { ...ok, receivedOn: '2999-01-01' })).toEqual({ ok: false, code: 'date' })
      expect(await recordPayment(user.admin, { ...ok, reference: '4111111111111111' })).toEqual({ ok: false, code: 'card' })
      expect(await recordPayment(user.admin, { ...ok, memberId: 999999 })).toEqual({ ok: false, code: 'member' })
      expect((await payload.count({ collection: 'fee-payments', overrideAccess: true })).totalDocs).toBe(0)
    })

    it('a split writes one row per child sharing a group, and a mid-split failure leaves nothing behind', async () => {
      const parent = await member({ firstName: 'Pat', lastName: 'Parent', roles: ['parent'] })
      const k1 = await member({ firstName: 'Kid', lastName: 'One', guardians: [parent.id] })
      const k2 = await member({ firstName: 'Kid', lastName: 'Two', guardians: [parent.id] })
      const outsider = await member({ firstName: 'Out', lastName: 'Sider' })
      const { recordPayment, voidPayment } = await import('@/lib/fees-office-queries')
      const base = { memberId: parent.id, amount: '10', receivedOn: '2026-08-01', method: 'cash', reference: '', note: '', payerId: String(parent.id), target: '', splitIds: [String(k1.id), String(k2.id)], splitShares: [] as string[] }
      expect(await recordPayment(user.admin, { ...base, splitIds: [String(k1.id), String(outsider.id)] })).toEqual({ ok: false, code: 'split' })
      expect((await payload.count({ collection: 'fee-payments', overrideAccess: true })).totalDocs).toBe(0)

      const real = payload.create.bind(payload)
      let calls = 0
      const spy = vi.spyOn(payload, 'create').mockImplementation(((args: { collection: string }) => {
        if (args.collection === 'fee-payments' && ++calls === 2) throw new Error('boom')
        return real(args as never)
      }) as never)
      expect(await recordPayment(user.admin, base)).toEqual({ ok: false, code: 'save' })
      spy.mockRestore()
      expect((await payload.count({ collection: 'fee-payments', overrideAccess: true })).totalDocs).toBe(0)

      expect(await recordPayment(user.admin, base)).toEqual({ ok: true, notice: 'paid' })
      const rows = (await payload.find({ collection: 'fee-payments', overrideAccess: true, depth: 0, sort: 'id' })).docs as unknown as { member: number; payer: number; splitGroup: string; amountCents: number }[]
      expect(rows.map((r) => [r.member, r.amountCents])).toEqual([[k1.id, 500], [k2.id, 500]])
      expect(new Set(rows.map((r) => r.splitGroup)).size).toBe(1)
      expect(rows.every((r) => r.payer === parent.id)).toBe(true)
      const first = (await payload.find({ collection: 'fee-payments', overrideAccess: true, depth: 0, sort: 'id', limit: 1 })).docs[0]
      expect(await voidPayment(user.admin, { id: first.id, reason: 'Wrong day', wholeGroup: 'yes' })).toEqual({ ok: true, notice: 'voided' })
      expect((await payload.count({ collection: 'fee-payments', where: { voidedAt: { exists: true } }, overrideAccess: true })).totalDocs).toBe(2)
    })

    it('waivers are added with a reason and void like payments; a waived game stops being owed', async () => {
      const p = await player('Wave')
      const m = await member({ firstName: 'Wave', lastName: 'Player', player: p.id })
      await join(m.id, tierPlay)
      await game(1, '2026-10-03', [{ id: p.id }])
      await game(2, '2026-10-10', [{ id: p.id }])
      const { addWaiver, voidWaiver } = await import('@/lib/fees-office-queries')
      expect(await addWaiver(user.admin, { memberId: m.id, scope: 'game', matchId: 'g1', season: '', amount: '', note: '' })).toEqual({ ok: false, code: 'note' })
      expect(await addWaiver(user.admin, { memberId: m.id, scope: 'game', matchId: 'g1', season: '', amount: '', note: 'Injured' })).toEqual({ ok: true, notice: 'waived' })
      expect(await row('Wave Player')).toMatchObject({ payableCents: 1000, waivedCents: 1000 })
      const w = (await payload.find({ collection: 'fee-waivers', overrideAccess: true, depth: 0 })).docs[0]
      expect(await voidWaiver(user.admin, { id: w.id, reason: 'Mistake' })).toEqual({ ok: true, notice: 'voided' })
      expect(await row('Wave Player')).toMatchObject({ payableCents: 2000, waivedCents: 0 })
    })
  })

  describe('closing a season', () => {
    it('freezes the charges, ignores later appearance changes, shows the drift warning, and corrects with a void plus an adjustment', async () => {
      const p = await player('Close')
      const m = await member({ firstName: 'Close', lastName: 'Player', player: p.id })
      const kid = await member({ firstName: 'Kid', lastName: 'Junior' })
      await join(m.id, tierPlay)
      await join(kid.id, tierJunior)
      await game(1, '2026-10-03', [{ id: p.id }])
      await game(2, '2026-10-10', [{ id: p.id }])
      const { closeSeason, addAdjustment, voidCharge, getMemberLedger } = await import('@/lib/fees-office-queries')
      expect(await closeSeason(user.editor, { season: SEASON, confirm: 'yes', closeAnyway: '' })).toEqual({ ok: false, code: 'forbidden' })
      expect(await closeSeason(user.admin, { season: SEASON, confirm: '', closeAnyway: '' })).toMatchObject({ ok: false })
      const orphan = await create('matches', { gameId: 'g8', status: 'FINAL', seasonName: SEASON, seasonStartYear: 2026, localDate: '2026-10-24' })
      await create('match-appearances', { match: orphan.id, appearanceId: 'o1', isClubSide: true, displayName: 'Mystery' })
      expect(await closeSeason(user.admin, { season: SEASON, confirm: 'yes', closeAnyway: '' })).toEqual({ ok: false, code: 'unmatched' })
      expect((await payload.count({ collection: 'fee-seasons', overrideAccess: true })).totalDocs).toBe(0)
      expect(await closeSeason(user.admin, { season: SEASON, confirm: 'yes', closeAnyway: 'yes' })).toEqual({ ok: true, notice: 'closed' })
      expect(await closeSeason(user.admin, { season: SEASON, confirm: 'yes', closeAnyway: 'yes' })).toEqual({ ok: false, code: 'closed' })
      expect((await payload.count({ collection: 'fee-charges', overrideAccess: true })).totalDocs).toBe(3)
      const seasonRow = (await payload.find({ collection: 'fee-seasons', overrideAccess: true, depth: 0 })).docs[0]
      expect(seasonRow).toMatchObject({ status: 'closed', chargesTotalCents: 8000, snapshotCount: 3, closedAnyway: true })
      const audit = (await payload.find({ collection: 'office-audit-log', overrideAccess: true, depth: 0 })).docs
      expect(audit.filter((a) => a.action === 'bulk-change')).toHaveLength(1)
      expect(JSON.stringify(audit)).not.toContain('Close')

      // The match data moves on: a re-sync adds a game. The closed figure holds and the report says so.
      await game(3, '2026-10-17', [{ id: p.id }])
      const after = await report()
      expect(after.closed).toBe(true)
      expect(after.rows.find((r) => r.name === 'Close Player')!.payableCents).toBe(2000)
      expect(after.drift).toEqual({ derivedCents: 9000, storedCents: 8000 })
      expect(after.incomplete).toBe(false)
      expect(await createMembershipAfterClose(m.id)).toMatch(/closed/)

      const ledger = await getMemberLedger(user.admin, m.id)
      const stored = ledger!.storedCharges[0]
      expect(await voidCharge(user.admin, { id: Number(stored.id), reason: 'Wrong game' })).toEqual({ ok: true, notice: 'voided' })
      expect(await addAdjustment(user.admin, { memberId: m.id, season: SEASON, amount: '10', note: 'Re-entered', date: '2026-12-01' })).toEqual({ ok: true, notice: 'adjusted' })
      expect(await addAdjustment(user.admin, { memberId: m.id, season: NEXT, amount: '10', note: 'Not closed', date: '2026-12-01' })).toEqual({ ok: false, code: 'season' })
      expect((await row('Close Player')).payableCents).toBe(2000)
      await expect(payload.update({ collection: 'fee-charges', id: stored.id, data: { amountCents: 1 }, overrideAccess: false, user: user.admin })).rejects.toThrow()
    })

    const createMembershipAfterClose = async (memberId: number) => {
      return (await why(join(memberId, tierPlay))) || 'no error'
    }
  })

  describe('routes, export and access', () => {
    it('answers an editor 403, a foreign origin 403 and records a payment for an admin with a short redirect', async () => {
      const m = await member({ firstName: 'Route', lastName: 'Test' })
      const form = { memberId: String(m.id), amount: '15', receivedOn: '2026-08-01', method: 'cash', return: `/office/fees/member/${m.id}` }
      expect((await post('payment', { token: tok.editor, form })).status).toBe(403)
      expect((await post('payment', { token: tok.admin, form, origin: 'https://evil.example' })).status).toBe(403)
      expect((await post('payment', { form })).status).toBe(401)
      const res = await post('payment', { token: tok.admin, form })
      expect(res.status).toBe(303)
      expect(res.headers.get('location')).toContain(`/office/fees/member/${m.id}?notice=paid`)
      const bad = await post('payment', { token: tok.admin, form: { ...form, amount: 'abc', return: 'https://evil.example/x' } })
      expect(bad.headers.get('location')).toContain('/office/fees?error=amount')
      expect((await post('unknown', { token: tok.admin, form })).status).toBe(404)
      expect((await payload.count({ collection: 'fee-payments', overrideAccess: true })).totalDocs).toBe(1)
    })

    it('REST cannot create a payment even for an admin, and the ledger collections are admin read only', async () => {
      const m = await member({ firstName: 'Rest', lastName: 'Probe' })
      const denied = (s: number) => s === 401 || s === 403
      expect(denied((await rest('POST', '/fee-payments', { token: tok.admin, body: { member: m.id, receivedOn: new Date().toISOString(), amountCents: 100, method: 'cash' } })).status)).toBe(true)
      for (const path of ['/fee-payments', '/fee-waivers', '/fee-charges', '/fee-seasons', '/memberships', '/membership-tiers']) {
        expect(denied((await rest('GET', path)).status), `${path} anonymous`).toBe(true)
        expect(denied((await rest('GET', path, { token: tok.editor })).status), `${path} editor`).toBe(true)
        expect((await rest('GET', path, { token: tok.admin })).status, `${path} admin`).toBe(200)
      }
    })

    it('the CSV is admin only, audited, neutralises a formula name, and never carries personal contact data', async () => {
      const m = await member({ firstName: '=HYPERLINK("http://x.example")', lastName: 'Evil', email: 'secret@example.org', phone: '0400 000 000', notes: 'private' })
      await join(m.id, tierJunior)
      const exportPost = async (token: string | undefined, form: Record<string, string> = { season: SEASON }) => {
        const body = new FormData()
        for (const [k, v] of Object.entries(form)) body.append(k, v)
        const headers: Record<string, string> = { Origin: ORIGIN }
        if (token) headers.Authorization = `JWT ${token}`
        const mod = await import('@/app/api/admin/office/export/fees/route')
        return mod.POST(new Request(`${ORIGIN}/api/admin/office/export/fees`, { method: 'POST', headers, body }))
      }
      expect((await exportPost(tok.editor)).status).toBe(403)
      expect((await exportPost(undefined)).status).toBe(401)
      expect((await payload.count({ collection: 'office-audit-log', overrideAccess: true })).totalDocs).toBe(0)
      const res = await exportPost(tok.admin, { season: SEASON, detail: 'yes' })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('no-store')
      const csv = await res.text()
      expect(csv).toContain(`'=HYPERLINK`)
      expect(csv).not.toMatch(/^=HYPERLINK/m)
      for (const secret of ['secret@example.org', '0400 000 000', 'private']) expect(csv).not.toContain(secret)
      expect(csv).toContain('Detail by charge')
      const audit = (await payload.find({ collection: 'office-audit-log', overrideAccess: true, depth: 0 })).docs
      expect(audit).toHaveLength(1)
      expect(audit[0]).toMatchObject({ action: 'export', module: 'fees', rowCount: expect.any(Number), includedSensitive: false })
      expect(JSON.stringify(audit[0].summary)).toBe(JSON.stringify({ detail: true, households: false, seasonStartYear: 2026 }))
    })

    it('fee data appears in no public page text', async () => {
      const m = await member({ firstName: 'Quiet', lastName: 'Payer', email: 'quiet@example.org' })
      const { recordPayment } = await import('@/lib/fees-office-queries')
      await join(m.id, tierJunior)
      await recordPayment(user.admin, { memberId: m.id, amount: '12.34', receivedOn: '2026-08-01', method: 'cash', reference: 'UNIQUE-REF-77', note: '', payerId: '', target: '', splitIds: [], splitShares: [] })
      for (const path of ['/players', '/fee-payments', '/memberships']) {
        const res = await rest('GET', path)
        expect(JSON.stringify(res.json)).not.toMatch(/UNIQUE-REF-77|12\.34|quiet@example\.org/)
      }
    })
  })

})
