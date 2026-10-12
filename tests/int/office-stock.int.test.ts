import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, tokenFor } from './helpers'
import { eraseMemberDetails } from '@/lib/office/erase'
import { onHand as pureOnHand, type MovementRow } from '@/lib/office/stock'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * Stock and merch (wave D WP-7) against real Postgres: the ledger arithmetic done in SQL matches the pure rule, two people cannot hand
 * out the last unit twice, returns / losses / voids put the numbers back correctly, the owed list, the stocktake, the route gates and
 * the erase label. Nothing leaves the machine.
 */
const ORIGIN = 'http://localhost:3000'

describe('stock and merch', () => {
  let payload: Payload
  const user: Record<string, never> = {} as never
  const tok: Record<string, string> = {}
  let q: typeof import('@/lib/stock-office-queries')
  let ann: number
  let ben: number

  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } }) as Promise<{ id: number } & Record<string, unknown>>
  const wipe = async () => {
    for (const c of ['stock-movements', 'stock-issues', 'stock-items', 'members', 'office-audit-log'] as const) await clearCollection(payload, c)
  }
  const item = async (name: string, extra: Record<string, unknown> = {}) => (await create('stock-items', { name, category: 'kit', returnable: true, active: true, ...extra })).id
  const hand = async (id: number) => (await q.onHandMap(payload, [id])).get(id) ?? 0
  const receive = async (id: number, qty: number) => expect(await q.receiveStock(user.editor, { item: String(id), qty: String(qty) })).toMatchObject({ ok: true })
  const issue = (id: number, member: number, qty: number, extra: Record<string, unknown> = {}) => q.issueStock(user.editor, { item: String(id), member: String(member), qty: String(qty), ...extra })
  const issues = async () => (await payload.find({ collection: 'stock-issues', pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs as unknown as Record<string, unknown>[]
  const moves = async (id: number) => (await payload.find({ collection: 'stock-movements', where: { item: { equals: id } }, pagination: false, depth: 0, sort: 'id', overrideAccess: true })).docs as unknown as Record<string, unknown>[]

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) {
      tok[role] = await tokenFor(payload, role)
      const found = await payload.find({ collection: 'users', where: { email: { equals: `${role}@example.com` } }, limit: 1, depth: 0, overrideAccess: true })
      user[role] = { ...(found.docs[0] as object), collection: 'users' } as never
    }
    q = await import('@/lib/stock-office-queries')
  }, 120_000)
  afterAll(async () => {
    await wipe().catch(() => undefined)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await wipe()
    ann = (await create('members', { firstName: 'Ann', lastName: 'Player', roles: ['player'] })).id
    ben = (await create('members', { firstName: 'Ben', lastName: 'Coach', roles: ['coach'] })).id
  })

  describe('the count', () => {
    it('is added up in SQL exactly as the pure rule says, voided rows and linked losses included', async () => {
      const id = await item('Helmet')
      await receive(id, 10)
      expect(await issue(id, ann, 3)).toMatchObject({ ok: true })
      const [i] = await issues()
      expect(await q.markLost(user.editor, { issue: String(i.id), qty: '1' })).toMatchObject({ ok: true })
      expect(await q.returnStock(user.editor, { issue: String(i.id), qty: '1' })).toMatchObject({ ok: true })
      expect(await q.removeStock(user.editor, { item: String(id), qty: '2', kind: 'written-off' })).toMatchObject({ ok: true })
      expect(await q.removeStock(user.editor, { item: String(id), qty: '1', kind: 'lost' })).toMatchObject({ ok: true })
      const rows = (await moves(id)).map((m): MovementRow => ({ id: m.id as number, itemId: id, kind: m.kind as MovementRow['kind'], qty: Number(m.qty), issueId: typeof m.issue === 'number' ? m.issue : null, voided: Boolean(m.voidedAt) }))
      expect(await hand(id)).toBe(pureOnHand(rows))
      // 10 in, 3 out, 1 back, 2 written off, 1 lost from the store; the loss linked to the issue takes nothing more.
      expect(await hand(id)).toBe(10 - 3 + 1 - 2 - 1)
    })
  })

  describe('issuing', () => {
    it('refuses to go below zero, unless "issue anyway" is ticked, and the person must be on the stock list', async () => {
      const id = await item('Cap')
      await receive(id, 1)
      expect(await issue(id, ann, 2)).toEqual({ ok: false, code: 'not-enough' })
      expect(await issues()).toHaveLength(0)
      const supporter = (await create('members', { firstName: 'Sue', lastName: 'Fan', roles: ['supporter'] })).id
      expect(await issue(id, supporter, 1)).toEqual({ ok: false, code: 'person' })
      expect(await issue(id, ann, 2, { anyway: 'yes' })).toMatchObject({ ok: true })
      expect(await hand(id)).toBe(-1)
      const off = await item('Old bat', { active: false })
      expect(await issue(off, ann, 1)).toEqual({ ok: false, code: 'item-inactive' })
    })

    it('hands out the last unit once when two people try at the same moment', async () => {
      const id = await item('Last shirt')
      await receive(id, 1)
      for (let round = 0; round < 3; round++) {
        const target = round === 0 ? id : await item(`Last shirt ${round}`)
        if (round > 0) await receive(target, 1)
        const [a, b] = await Promise.all([issue(target, ann, 1), issue(target, ben, 1)])
        expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
        const lost = [a, b].find((r) => !r.ok)
        expect(lost).toEqual({ ok: false, code: 'not-enough' })
        expect(await hand(target)).toBe(0)
      }
      expect((await issues()).length).toBe(3)
    })

    it('a double tap with the same form key records one issue', async () => {
      const id = await item('Pads')
      await receive(id, 5)
      const nonce = '11111111-2222-3333-4444-555555555555'
      const [a, b] = await Promise.all([issue(id, ann, 1, { nonce }), issue(id, ann, 1, { nonce })])
      expect(a.ok && b.ok).toBe(true)
      expect(await issues()).toHaveLength(1)
      expect(await hand(id)).toBe(4)
      // A form sent again later (Back button, changed values) is told so, not shown a fresh success.
      expect(await issue(id, ann, 2, { nonce })).toMatchObject({ ok: true, notice: 'already-saved' })
      expect(await issues()).toHaveLength(1)
    })

    it('the tile counts units, like the Owed back tab', async () => {
      const id = await item('Shirt')
      await receive(id, 5)
      await issue(id, ann, 2)
      expect(await q.stockFigures(user.editor)).toMatchObject({ out: 2 })
      expect((await q.getStockPage(user.editor, {}))!.counts.owedUnits).toBe(2)
    })

    it('a person page opens only for people who can be given kit or already hold a record', async () => {
      const parent = (await create('members', { firstName: 'Pat', lastName: 'Parent', roles: ['parent'] })).id
      expect(await q.getPersonPage(user.editor, parent)).toBeNull()
      expect(await q.getPersonPage(user.editor, ann)).toMatchObject({ person: 'Ann Player' })
      expect(await q.getPersonPage(user.selector, ann)).toBeNull()
    })
  })

  describe('returns, losses and what is owed', () => {
    it('part return leaves the rest owed, more than held is refused, and owed shrinks to nothing', async () => {
      const id = await item('Helmet')
      await receive(id, 4)
      await issue(id, ann, 2, { issuedOn: '2019-12-01', dueBackOn: '2020-01-01' })
      const [i] = await issues()
      let page = (await q.getStockPage(user.editor, { tab: 'owed' }))!
      expect(page.owed).toHaveLength(1)
      expect(page.owed[0]).toMatchObject({ person: 'Ann Player', owed: 2, overdue: true })
      expect(await q.returnStock(user.editor, { issue: String(i.id), qty: '3' })).toEqual({ ok: false, code: 'too-many' })
      expect(await q.returnStock(user.editor, { issue: String(i.id), qty: '1' })).toMatchObject({ ok: true })
      page = (await q.getStockPage(user.editor, { tab: 'owed' }))!
      expect(page.owed[0]).toMatchObject({ owed: 1, status: 'part-returned' })
      expect(await hand(id)).toBe(3)
      expect(await q.returnStock(user.editor, { issue: String(i.id), qty: '1' })).toMatchObject({ ok: true })
      page = (await q.getStockPage(user.editor, { tab: 'owed' }))!
      expect(page.owed).toHaveLength(0)
      expect(await hand(id)).toBe(4)
      expect(await q.returnStock(user.editor, { issue: String(i.id), qty: '1' })).toEqual({ ok: false, code: 'too-many' })
    })

    it('a loss settles the debt without taking stock away twice; things given away are never owed', async () => {
      const id = await item('Shirt')
      await receive(id, 3)
      await issue(id, ann, 1)
      const [i] = await issues()
      expect(await q.markLost(user.editor, { issue: String(i.id), qty: '1' })).toMatchObject({ ok: true })
      expect(await hand(id)).toBe(2)
      expect((await q.getStockPage(user.editor, { tab: 'owed' }))!.owed).toHaveLength(0)
      const cap = await item('Cap', { category: 'consumables', returnable: false })
      await receive(cap, 3)
      await issue(cap, ben, 1)
      expect((await q.getStockPage(user.editor, { tab: 'owed' }))!.owed).toHaveLength(0)
      const given = (await issues()).find((x) => x.returnable === false)!
      expect(await q.returnStock(user.editor, { issue: String(given.id), qty: '1' })).toEqual({ ok: false, code: 'not-returnable' })
    })

    it('figures count low items and overdue kit, and say nothing for a selector', async () => {
      const id = await item('Balls', { reorderLevel: 2 })
      await receive(id, 2)
      await item('Unchecked')
      const helmet = await item('Helmet')
      await receive(helmet, 2)
      await issue(helmet, ann, 1, { issuedOn: '2019-12-01', dueBackOn: '2020-01-01' })
      await issue(helmet, ben, 1, { dueBackOn: '2999-01-01' })
      expect(await q.stockFigures(user.editor)).toMatchObject({ low: 1, overdue: 1, out: 2 })
      expect(await q.stockFigures(user.selector)).toBeNull()
      expect(await q.getStockPage(user.selector, {})).toBeNull()
    })
  })

  describe('voiding', () => {
    it('voiding an issue puts the stock back and voids the issue; voiding a return makes it owed again', async () => {
      const id = await item('Helmet')
      await receive(id, 2)
      await issue(id, ann, 1)
      const [i] = await issues()
      await q.returnStock(user.editor, { issue: String(i.id), qty: '1' })
      const all = await moves(id)
      const issued = all.find((m) => m.kind === 'issued')!
      const returned = all.find((m) => m.kind === 'returned')!
      expect(await q.voidMovement(user.editor, { id: String(issued.id), reason: 'wrong person' })).toEqual({ ok: false, code: 'has-returns' })
      expect(await q.voidMovement(user.editor, { id: String(returned.id), reason: '' })).toEqual({ ok: false, code: 'reason' })
      expect(await q.voidMovement(user.editor, { id: String(returned.id), reason: 'not back yet' })).toMatchObject({ ok: true })
      expect(await hand(id)).toBe(1)
      expect((await q.getStockPage(user.editor, { tab: 'owed' }))!.owed).toHaveLength(1)
      expect(await q.voidMovement(user.editor, { id: String(issued.id), reason: 'wrong person' })).toMatchObject({ ok: true })
      expect(await hand(id)).toBe(2)
      expect((await issues())[0].voidedAt).toBeTruthy()
      expect((await q.getStockPage(user.editor, { tab: 'owed' }))!.owed).toHaveLength(0)
      expect(await q.voidMovement(user.editor, { id: String(issued.id), reason: 'again' })).toEqual({ ok: false, code: 'not-found' })
      // The history is kept: nothing was deleted.
      expect((await moves(id)).length).toBe(3)
    })

    it('refuses a void that would take the count below zero', async () => {
      const id = await item('Helmet')
      await receive(id, 2)
      await issue(id, ann, 2)
      const received = (await moves(id)).find((m) => m.kind === 'received')!
      expect(await q.voidMovement(user.editor, { id: String(received.id), reason: 'typo' })).toEqual({ ok: false, code: 'would-go-negative' })
      expect(await hand(id)).toBe(0)
    })
  })

  describe('stocktake', () => {
    it('posts adjustments for the differences, nothing for a match, and refuses if the stock moved', async () => {
      const a = await item('Bat')
      const b = await item('Ball')
      await receive(a, 5)
      await receive(b, 4)
      const counts = [{ itemId: a, counted: 3, expected: 5 }, { itemId: b, counted: 4, expected: 4 }]
      expect(await q.postStocktake(user.editor, { counts: [{ itemId: a, counted: 3, expected: 9 }] })).toEqual({ ok: false, code: 'changed' })
      expect(await q.postStocktake(user.editor, { counts, nonce: '22222222-2222-3333-4444-555555555555' })).toMatchObject({ ok: true, notice: 'stocktake', n: 1 })
      expect(await hand(a)).toBe(3)
      expect(await hand(b)).toBe(4)
      expect((await moves(b)).filter((m) => m.kind === 'adjustment')).toHaveLength(0)
      // The same form posted twice changes nothing more.
      expect(await q.postStocktake(user.editor, { counts, nonce: '22222222-2222-3333-4444-555555555555' })).toMatchObject({ ok: true })
      expect(await hand(a)).toBe(3)
      expect(await q.postStocktake(user.editor, { counts: [{ itemId: b, counted: 4, expected: 4 }] })).toMatchObject({ ok: true, notice: 'stocktake-none' })
    })

    it('can correct a negative count back up', async () => {
      const id = await item('Cap')
      await issue(id, ann, 2, { anyway: 'yes' })
      expect(await hand(id)).toBe(-2)
      expect(await q.postStocktake(user.editor, { counts: [{ itemId: id, counted: 0, expected: -2 }] })).toMatchObject({ ok: true })
      expect(await hand(id)).toBe(0)
    })
  })

  describe('access', () => {
    it('refuses every action to a selector and anonymous callers', async () => {
      const id = await item('Helmet')
      for (const who of [user.selector, undefined]) {
        expect(await q.addItem(who, { name: 'x', category: 'kit' })).toEqual({ ok: false, code: 'forbidden' })
        expect(await q.receiveStock(who, { item: String(id), qty: '1' })).toEqual({ ok: false, code: 'forbidden' })
        expect(await issue(id, ann, 1, { anyway: 'yes' })).toMatchObject({ ok: true })
        const [i] = await issues()
        expect(await q.returnStock(who, { issue: String(i.id), qty: '1' })).toEqual({ ok: false, code: 'forbidden' })
        expect(await q.voidMovement(who, { id: '1', reason: 'x' })).toEqual({ ok: false, code: 'forbidden' })
        expect(await q.postStocktake(who, { counts: [{ itemId: id, counted: 1, expected: 0 }] })).toEqual({ ok: false, code: 'forbidden' })
        await clearCollection(payload, 'stock-movements')
        await clearCollection(payload, 'stock-issues')
      }
    })

    it('an item with history cannot be deleted, an empty one can (admin only)', async () => {
      const id = await item('Helmet')
      await receive(id, 1)
      await expect(payload.delete({ collection: 'stock-items', id, overrideAccess: true })).rejects.toThrow(/history/)
      const empty = await item('Spare')
      await expect(payload.delete({ collection: 'stock-items', id: empty, user: user.editor, overrideAccess: false })).rejects.toThrow()
      await expect(payload.delete({ collection: 'stock-items', id: empty, user: user.admin, overrideAccess: false })).resolves.toBeTruthy()
    })

    it('the forms answer 401 to nobody, 403 to a selector or a foreign origin, and work for an editor', async () => {
      const post = async (action: string, opts: { token?: string; origin?: string | null; form?: Record<string, string> } = {}) => {
        const body = new FormData()
        for (const [k, v] of Object.entries(opts.form ?? {})) body.append(k, v)
        const headers: Record<string, string> = {}
        if (opts.origin !== null) headers.Origin = opts.origin ?? ORIGIN
        if (opts.token) headers.Authorization = `JWT ${opts.token}`
        const mod = await import('@/app/api/admin/office/stock/[action]/route')
        return mod.POST(new Request(`${ORIGIN}/api/admin/office/stock/${action}`, { method: 'POST', headers, body }), { params: Promise.resolve({ action }) })
      }
      const form = { name: 'Gloves', category: 'equipment', return: '/office/stock' }
      expect((await post('item-add', { form })).status).toBe(401)
      expect((await post('item-add', { token: tok.selector, form })).status).toBe(403)
      expect((await post('item-add', { token: tok.editor, origin: 'https://evil.example', form })).status).toBe(403)
      const ok = await post('item-add', { token: tok.editor, form })
      expect(ok.status).toBe(303)
      expect(ok.headers.get('Location')).toContain('notice=item-added')
      expect((await payload.count({ collection: 'stock-items', overrideAccess: true })).totalDocs).toBe(1)
      // A crafted return address is ignored; a bad quantity comes back as a short code.
      const bad = await post('receive', { token: tok.editor, form: { item: '1', qty: '-3', return: 'https://evil.example/' } })
      expect(bad.headers.get('Location')).toMatch(/\/admin\/office\/stock\?error=/)
      expect((await post('nonsense', { token: tok.editor })).status).toBe(404)
    })
  })

  describe('the owed download', () => {
    const exportPost = async (token?: string, origin: string | null = ORIGIN) => {
      const headers: Record<string, string> = {}
      if (origin !== null) headers.Origin = origin
      if (token) headers.Authorization = `JWT ${token}`
      const mod = await import('@/app/api/admin/office/export/stock-owed/route')
      return mod.POST(new Request(`${ORIGIN}/api/admin/office/export/stock-owed`, { method: 'POST', headers, body: new FormData() }))
    }

    it('is admin only and logged; an editor can issue but not download', async () => {
      const id = await item('Helmet')
      await receive(id, 2)
      await issue(id, ann, 1, { issuedOn: '2019-12-01', dueBackOn: '2020-01-01' })
      expect((await exportPost()).status).toBe(401)
      expect((await exportPost(tok.selector)).status).toBe(403)
      expect((await exportPost(tok.editor)).status).toBe(403)
      expect((await exportPost(tok.admin, 'https://evil.example')).status).toBe(403)
      expect((await payload.count({ collection: 'office-audit-log', overrideAccess: true })).totalDocs).toBe(0)
      const res = await exportPost(tok.admin)
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toContain('no-store')
      const text = await res.text()
      expect(text).toContain('Ann Player')
      expect(text).toContain('Helmet')
      expect(text).toContain('Overdue')
      const audit = (await payload.find({ collection: 'office-audit-log', depth: 0, overrideAccess: true })).docs[0] as unknown as { module: string; rowCount: number; summary: unknown }
      expect(audit.module).toBe('stock')
      expect(audit.rowCount).toBe(1)
      expect(JSON.stringify(audit.summary)).not.toContain('Ann')
      await expect(q.owedExportTable(user.editor)).rejects.toThrow()
    })

    it('neutralises a name that a spreadsheet could read as a formula', async () => {
      const evil = (await create('members', { firstName: '=SUM(1)', lastName: 'Cell', roles: ['player'] })).id
      const id = await item('Helmet')
      await receive(id, 1)
      await issue(id, evil, 1)
      const text = await (await exportPost(tok.admin)).text()
      expect(text).not.toMatch(/(^|,)"?=SUM/m)
    })
  })

  describe('people who are erased', () => {
    it('keep their issue rows, labelled Former member, and still owe the kit back', async () => {
      const id = await item('Helmet')
      await receive(id, 2)
      await issue(id, ann, 1)
      expect(await eraseMemberDetails(payload, user.admin, ann)).toEqual({ ok: true })
      const page = (await q.getStockPage(user.editor, { tab: 'owed' }))!
      expect(page.owed).toHaveLength(1)
      expect(page.owed[0].person).toBe('Former member')
      expect(JSON.stringify(page)).not.toContain('Ann')
      const person = await q.getPersonPage(user.editor, ann)
      expect(person?.person).toBe('Former member')
      expect((await issues()).length).toBe(1)
      // A member with stock records cannot be hard deleted.
      await expect(payload.delete({ collection: 'members', id: ann, overrideAccess: true })).rejects.toThrow()
    })

    it('a junior is shown as first name and initial on the owed list', async () => {
      const kid = (await create('members', { firstName: 'Sam', lastName: 'Tiny', roles: ['player'], dateOfBirth: `${new Date().getFullYear() - 10}-01-01T12:00:00.000Z` })).id
      const id = await item('Helmet')
      await receive(id, 1)
      await issue(id, kid, 1)
      const page = (await q.getStockPage(user.editor, { tab: 'owed' }))!
      expect(page.owed[0].person).toBe('Sam T.')
      const picker = (await q.getItemPage(user.editor, id))!.people.map((p) => p.displayName)
      expect(picker).toContain('Sam T.')
      expect(picker).not.toContain('Sam Tiny')
    })
  })
})
