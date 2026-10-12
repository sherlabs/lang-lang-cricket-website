import { handleEndpoints, type Payload } from 'payload'
import config from '@payload-config'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { OFFICE_FILE_MAX_BYTES } from '@/lib/office/meetings'
import { STARTER_TEMPLATES } from '@/lib/office/starter-meetings'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * Committee meetings, seat handover and office-bearer documents (wave D WP-4) against real Postgres. Five personas: anonymous,
 * a selector, an editor who is NOT an office-bearer, an editor who holds an office-bearer seat, and an admin. Restricted rows,
 * documents and the download route must hold for each, and a handover must take effect on the very next request with no re-login.
 */
const PDF = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n9\n%%EOF\n'

describe('committee meetings', () => {
  let payload: Payload
  const user: Record<string, never> = {} as never
  const tok: Record<string, string> = {}
  let q: typeof import('@/lib/meetings-office-queries')
  let seats: Record<string, number> = {}
  let people: Record<string, number> = {}
  let templates: Record<string, number> = {}

  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } }) as Promise<{ id: number } & Record<string, unknown>>
  const wipe = async () => {
    for (const c of ['committee-documents', 'office-files', 'meeting-actions', 'meeting-motions', 'meeting-attendance', 'meeting-items', 'meetings', 'meeting-templates', 'committee-seats', 'people', 'office-audit-log'] as const) await clearCollection(payload, c)
  }
  const download = async (filename: string, token?: string) => {
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `JWT ${token}`
    const res = await handleEndpoints({ config, request: new Request(`http://localhost:3000/api/office-files/file/${encodeURIComponent(filename)}`, { headers }) })
    return res
  }
  const file = (name: string, content: string | Uint8Array, type = 'application/pdf') => new File([content as BlobPart], name, { type })
  const newMeeting = async (who: 'admin' | 'editor' | 'bearer', templateKey: string, date = '2026-11-03') => {
    const r = await q.createMeeting(user[who], { templateId: templates[templateKey], date, time: '19:00', title: '', venue: 'Clubrooms' })
    expect(r, `create as ${who}`).toMatchObject({ ok: true })
    return (r as { id: number }).id
  }
  const itemOf = async (meetingId: number, kind: string) => (await payload.find({ collection: 'meeting-items', where: { and: [{ meeting: { equals: meetingId } }, { kind: { equals: kind } }] }, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as { id: number; effectiveRestricted: boolean }
  const asUser = (who: string) => ({ user: user[who], overrideAccess: false as const, depth: 0 })

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) tok[role] = await tokenFor(payload, role)
    tok.bearer = await tokenFor(payload, 'editor', 'bearer@example.com')
    tok.newbearer = await tokenFor(payload, 'editor', 'newbearer@example.com')
    for (const [key, email] of [['admin', 'admin@example.com'], ['editor', 'editor@example.com'], ['selector', 'selector@example.com'], ['bearer', 'bearer@example.com'], ['newbearer', 'newbearer@example.com']] as const) {
      const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
      user[key] = { ...(found.docs[0] as object), collection: 'users' } as never
    }
    q = await import('@/lib/meetings-office-queries')
  }, 120_000)
  afterAll(async () => {
    await wipe().catch(() => undefined)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await wipe()
    people = {}
    for (const n of ['Pat President', 'Sam Secretary', 'Tess Treasurer', 'Newt Newcomer']) people[n.split(' ')[0]] = (await create('people', { name: n, role: n.split(' ')[1] })).id
    seats = {}
    seats.president = (await create('committee-seats', { title: 'President', sortOrder: 1, holder: people.Pat, holderUser: (user.bearer as { id: number }).id, officeBearer: true })).id
    seats.secretary = (await create('committee-seats', { title: 'Secretary', sortOrder: 2, holder: people.Sam, holderUser: (user.editor as { id: number }).id, officeBearer: false })).id
    seats.treasurer = (await create('committee-seats', { title: 'Treasurer', sortOrder: 3, holder: people.Tess, officeBearer: true })).id
    expect(await q.addStandardTemplates(user.editor)).toMatchObject({ ok: true, n: STARTER_TEMPLATES.length })
    templates = {}
    for (const t of (await payload.find({ collection: 'meeting-templates', pagination: false, depth: 0, overrideAccess: true })).docs) templates[t.kind as string] = t.id
  })

  it('the standard agendas are added once and re-running adds none', async () => {
    expect(await q.addStandardTemplates(user.editor)).toMatchObject({ ok: true, n: 0 })
    expect(await q.addStandardTemplates(user.selector)).toEqual({ ok: false, code: 'forbidden' })
    expect((await payload.count({ collection: 'meeting-templates', overrideAccess: true })).totalDocs).toBe(STARTER_TEMPLATES.length)
  })

  it('a new meeting copies the agenda, restricts finance items, adds the seat holders and a Business arising item', async () => {
    const id = await newMeeting('bearer', 'ordinary')
    const items = (await payload.find({ collection: 'meeting-items', where: { meeting: { equals: id } }, sort: 'order', pagination: false, depth: 0, overrideAccess: true })).docs as unknown as { title: string; kind: string; restricted: boolean; effectiveRestricted: boolean }[]
    expect(items.map((i) => i.kind)).toContain('business')
    const finance = items.find((i) => i.kind === 'financial')!
    expect(finance).toMatchObject({ restricted: true, effectiveRestricted: true })
    expect(items.filter((i) => i.effectiveRestricted)).toHaveLength(1)
    const att = await payload.find({ collection: 'meeting-attendance', where: { meeting: { equals: id } }, pagination: false, depth: 0, overrideAccess: true })
    expect(att.totalDocs).toBe(3)
    expect(await q.createMeeting(user.selector, { templateId: templates.ordinary, date: '2026-11-03', time: '19:00', title: '', venue: '' })).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.createMeeting(user.editor, { templateId: 999999, date: '2026-11-03', time: '19:00', title: '', venue: '' })).toEqual({ ok: false, code: 'template' })
  })

  it('an editor who is not an office-bearer cannot read a restricted item, its motion, action or the notes (Local API, REST and the page)', async () => {
    const id = await newMeeting('editor', 'ordinary')
    const fin = await itemOf(id, 'financial')
    // The bearer records finance matters.
    expect(await q.saveItem(user.bearer, { id: fin.id, notes: 'Overdraft is large', outcome: '' })).toMatchObject({ ok: true })
    expect(await q.addMotion(user.bearer, { meetingId: id, itemId: fin.id, text: 'Pay the overdraft', votesFor: '5', votesAgainst: '0', abstain: '0', result: 'carried' })).toMatchObject({ ok: true })
    expect(await q.addAction(user.bearer, { meetingId: id, itemId: fin.id, text: 'Call the bank', ownerSeat: seats.treasurer, ownerPerson: '', due: '2020-01-01' })).toMatchObject({ ok: true })
    const motion = (await payload.find({ collection: 'meeting-motions', pagination: false, depth: 0, overrideAccess: true })).docs[0]
    const action = (await payload.find({ collection: 'meeting-actions', pagination: false, depth: 0, overrideAccess: true })).docs[0]
    expect(motion.effectiveRestricted).toBe(true)
    expect(action.effectiveRestricted).toBe(true)

    for (const [collection, rowId] of [['meeting-items', fin.id], ['meeting-motions', motion.id], ['meeting-actions', action.id]] as const) {
      expect((await payload.find({ collection, where: { id: { equals: rowId } }, ...asUser('editor') })).totalDocs, `${collection} find`).toBe(0)
      await expect(payload.findByID({ collection, id: rowId, ...asUser('editor') }), `${collection} findByID`).rejects.toBeTruthy()
      expect((await payload.find({ collection, where: { id: { equals: rowId } }, ...asUser('bearer') })).totalDocs, `${collection} bearer`).toBe(1)
      expect((await payload.find({ collection, where: { id: { equals: rowId } }, ...asUser('admin') })).totalDocs, `${collection} admin`).toBe(1)
      await expect(payload.find({ collection, where: { id: { equals: rowId } }, ...asUser('selector') }), `${collection} selector`).rejects.toBeTruthy()
    }
    const viaRest = await rest('GET', `/meeting-items/${fin.id}`, { token: tok.editor })
    expect(viaRest.status === 403 || viaRest.status === 404).toBe(true)
    expect((await rest('GET', `/meeting-items/${fin.id}`, { token: tok.bearer })).status).toBe(200)
    expect(JSON.stringify((await rest('GET', '/meeting-items?limit=100', { token: tok.editor })).json)).not.toContain('Overdraft')
    expect(JSON.stringify((await rest('GET', '/meeting-actions?limit=100', { token: tok.editor })).json)).not.toContain('Call the bank')

    const editorPage = await q.getMeetingPage(user.editor, id)
    expect(editorPage!.hiddenItems).toBe(1)
    expect(editorPage!.items.map((i) => i.kind)).not.toContain('financial')
    expect(JSON.stringify(editorPage)).not.toContain('Overdraft')
    expect(JSON.stringify(editorPage)).not.toContain('Call the bank')
    const bearerPage = await q.getMeetingPage(user.bearer, id)
    expect(bearerPage!.hiddenItems).toBe(0)
    expect(bearerPage!.items.find((i) => i.kind === 'financial')!.notes).toBe('Overdraft is large')

    // The hidden item cannot be edited or un-restricted by the editor, and a bearer can lift the restriction.
    expect(await q.saveItem(user.editor, { id: fin.id, notes: 'x', outcome: '' })).toEqual({ ok: false, code: 'not-found' })
    expect(await q.setItemRestricted(user.editor, { id: fin.id, restricted: 'false' })).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.setItemRestricted(user.selector, { id: fin.id, restricted: 'false' })).toEqual({ ok: false, code: 'forbidden' })

    // Counts follow the same rule: the restricted overdue action counts for the bearer only.
    expect((await q.meetingStats(user.bearer))!.overdue).toBe(1)
    expect((await q.meetingStats(user.editor))!.overdue).toBe(0)
    expect((await q.getActionsPage(user.editor, null))!.actions).toHaveLength(0)
    expect((await q.getActionsPage(user.bearer, null))!.actions).toHaveLength(1)
  })

  it('a restricted meeting (special) is invisible to a non-bearer: list, page, minutes and counts', async () => {
    const id = await newMeeting('bearer', 'special', '2026-11-10')
    const doc = await payload.findByID({ collection: 'meetings', id, overrideAccess: true, depth: 0 })
    expect(doc.restricted).toBe(true)
    const items = await payload.find({ collection: 'meeting-items', where: { meeting: { equals: id } }, pagination: false, depth: 0, overrideAccess: true })
    expect(items.docs.every((i) => i.effectiveRestricted)).toBe(true)
    expect((await payload.find({ collection: 'meetings', ...asUser('editor') })).totalDocs).toBe(0)
    await expect(payload.findByID({ collection: 'meetings', id, ...asUser('editor') })).rejects.toBeTruthy()
    expect((await payload.find({ collection: 'meetings', ...asUser('bearer') })).totalDocs).toBe(1)
    expect(await q.getMeetingPage(user.editor, id)).toBeNull()
    expect(await q.getMinutesPage(user.editor, id)).toBeNull()
    expect(await q.getMeetingPage(user.bearer, id)).not.toBeNull()
    const list = await q.getMeetingsPage(user.editor)
    expect(list!.hiddenMeetings).toBe(1)
    expect([...list!.upcoming, ...list!.past]).toHaveLength(0)
    expect((await q.getMeetingsPage(user.bearer))!.hiddenMeetings).toBe(0)
    // Writes against it are refused for the editor, whatever the action.
    expect(await q.addGuest(user.editor, { meetingId: id, name: 'Sneaky' })).toEqual({ ok: false, code: 'not-found' })
    expect(await q.closeMeeting(user.editor, id)).toEqual({ ok: false, code: 'not-found' })
    expect(await q.setMeetingRestricted(user.editor, { meetingId: id, restricted: 'false' })).toEqual({ ok: false, code: 'forbidden' })
    // A bearer can lift the restriction on the meeting, and children follow.
    expect(await q.setMeetingRestricted(user.bearer, { meetingId: id, restricted: 'false' })).toMatchObject({ ok: true })
    expect((await payload.find({ collection: 'meeting-items', where: { meeting: { equals: id } }, ...asUser('editor') })).totalDocs).toBeGreaterThan(0)
  })

  it('closing builds minutes without restricted content for a non-bearer; the bearer print view adds it as a separate part', async () => {
    const id = await newMeeting('editor', 'ordinary')
    const fin = await itemOf(id, 'financial')
    await q.saveItem(user.bearer, { id: fin.id, notes: 'Secret sum 12345', outcome: '' })
    const biz = await itemOf(id, 'business')
    await q.saveItem(user.editor, { id: biz.id, notes: 'Public roof chat', outcome: '' })
    expect(await q.closeMeeting(user.editor, id)).toMatchObject({ ok: true })
    const stored = (await payload.findByID({ collection: 'meetings', id, depth: 0, overrideAccess: true })).minutesText as string
    expect(stored).toContain('Public roof chat')
    expect(stored).not.toContain('Secret sum')
    expect(stored).toContain('1 restricted item is not shown.')
    const asEditor = await q.getMinutesPage(user.editor, id)
    expect(JSON.stringify(asEditor)).not.toContain('Secret sum')
    expect(asEditor!.annex).toBe('')
    const asBearer = await q.getMinutesPage(user.bearer, id)
    expect(asBearer!.annex).toContain('Secret sum 12345')
    expect(asBearer!.text).not.toContain('Secret sum')
    // A closed meeting takes no new motions, but its actions can still be finished.
    expect(await q.addMotion(user.editor, { meetingId: id, itemId: '', text: 'late', votesFor: '', votesAgainst: '', abstain: '', result: '' })).toEqual({ ok: false, code: 'closed' })
    expect(await q.saveMinutes(user.editor, { meetingId: id, text: `${stored}\nEdited by hand` })).toMatchObject({ ok: true })
    expect(await q.reopenMeeting(user.editor, id)).toMatchObject({ ok: true })
  })

  it('restricting an item after the meeting closed scrubs it from the saved minutes; a seat-less editor cannot create a restricted meeting', async () => {
    const id = await newMeeting('editor', 'ordinary', '2026-10-06')
    const biz = await itemOf(id, 'business')
    await q.saveItem(user.editor, { id: biz.id, notes: 'LATE-SECRET-77', outcome: '' })
    expect(await q.closeMeeting(user.editor, id)).toMatchObject({ ok: true })
    expect(((await payload.findByID({ collection: 'meetings', id, depth: 0, overrideAccess: true })).minutesText as string)).toContain('LATE-SECRET-77')
    expect(await q.setItemRestricted(user.bearer, { id: biz.id, restricted: 'true' })).toMatchObject({ ok: true })
    const stored = (await payload.findByID({ collection: 'meetings', id, depth: 0, overrideAccess: true })).minutesText as string
    expect(stored).not.toContain('LATE-SECRET-77')
    expect(JSON.stringify(await q.getMinutesPage(user.editor, id))).not.toContain('LATE-SECRET-77')
    expect(await q.createMeeting(user.editor, { templateId: templates.special, date: '2026-11-10', time: '19:00', title: '', venue: '' })).toEqual({ ok: false, code: 'restricted-create' })
  })

  it('attendance, guests, motions and actions are recorded; approving the previous minutes marks them approved', async () => {
    const first = await newMeeting('editor', 'ordinary', '2026-11-03')
    expect(await q.setAttendance(user.editor, { meetingId: first, personId: people.Newt, state: 'apology' })).toMatchObject({ ok: true })
    expect(await q.addGuest(user.editor, { meetingId: first, name: 'Visitor Vic' })).toMatchObject({ ok: true })
    const att = (await q.getMeetingPage(user.editor, first))!
    expect(att.presentCount).toBe(4)
    expect(att.attendance.find((a) => a.name === 'Newt Newcomer')!.state).toBe('apology')
    const row = att.attendance.find((a) => a.name === 'Pat President')!
    expect(await q.setAttendanceRow(user.editor, { id: row.id, state: 'absent' })).toMatchObject({ ok: true })
    expect((await q.getMeetingPage(user.editor, first))!.presentCount).toBe(3)
    expect(await q.setAttendanceRow(user.editor, { id: row.id, state: 'maybe' })).toEqual({ ok: false, code: 'state' })
    const biz = await itemOf(first, 'business')
    expect(await q.addMotion(user.editor, { meetingId: first, itemId: biz.id, text: 'Buy a mower', votesFor: '4', votesAgainst: '1', abstain: '', result: 'carried' })).toMatchObject({ ok: true })
    expect(await q.addMotion(user.editor, { meetingId: first, itemId: biz.id, text: 'Buy a mower', votesFor: '-4', votesAgainst: '', abstain: '', result: '' })).toEqual({ ok: false, code: 'count' })
    expect(await q.addAction(user.editor, { meetingId: first, itemId: biz.id, text: 'Get quotes', ownerSeat: seats.secretary, ownerPerson: '', due: '2026-11-20' })).toMatchObject({ ok: true })
    expect(await q.closeMeeting(user.editor, first)).toMatchObject({ ok: true })

    const second = await newMeeting('editor', 'ordinary', '2026-12-01')
    const page = (await q.getMeetingPage(user.editor, second))!
    expect(page.previousMinutes).toMatchObject({ id: first })
    expect(page.carried.map((a) => a.text)).toEqual(['Get quotes'])
    expect(await q.approveMinutes(user.editor, { meetingId: second, previousId: first })).toMatchObject({ ok: true })
    const approved = await payload.findByID({ collection: 'meetings', id: first, depth: 0, overrideAccess: true })
    expect(approved).toMatchObject({ minutesStatus: 'approved' })
    expect(await q.approveMinutes(user.editor, { meetingId: second, previousId: first })).toEqual({ ok: false, code: 'status' })
    expect(await q.saveMinutes(user.editor, { meetingId: first, text: 'rewrite history' })).toEqual({ ok: false, code: 'status' })
    // An action is finished from anywhere.
    const action = (await payload.find({ collection: 'meeting-actions', pagination: false, depth: 0, overrideAccess: true })).docs[0]
    expect(await q.setActionStatus(user.editor, { id: action.id, status: 'done' })).toMatchObject({ ok: true })
    expect((await q.getMeetingPage(user.editor, second))!.carried).toHaveLength(0)
  })

  it('office-bearer documents: a seat-less editor and a selector cannot list, read or download; the bearer can, but cannot delete', async () => {
    expect(await q.addDocument(user.editor, { title: 'Insurance', category: 'insurance', meetingId: '', file: file('policy.pdf', PDF) })).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.addDocument(user.selector, { title: 'Insurance', category: 'insurance', meetingId: '', file: file('policy.pdf', PDF) })).toEqual({ ok: false, code: 'forbidden' })
    const added = await q.addDocument(user.bearer, { title: 'Insurance 2026', category: 'insurance', meetingId: '', file: file('policy.pdf', PDF) })
    expect(added).toMatchObject({ ok: true })
    const doc = (await payload.find({ collection: 'committee-documents', depth: 1, overrideAccess: true })).docs[0] as unknown as { id: number; uploadedBy: number; file: { id: number; filename: string; url: string } }
    expect((doc.uploadedBy as unknown as { id: number }).id ?? doc.uploadedBy).toBe((user.bearer as { id: number }).id)
    // The address handed out is our own access-controlled route, never a blob address.
    expect(doc.file.url).toMatch(/\/api\/office-files\/file\/policy\.pdf$/)

    for (const who of ['editor', 'selector'] as const) {
      expect((await payload.find({ collection: 'committee-documents', ...asUser(who) }).catch(() => ({ totalDocs: 0 }))).totalDocs, who).toBe(0)
      expect((await rest('GET', '/committee-documents', { token: tok[who] })).status, who).toBe(403)
      expect((await rest('GET', `/office-files/${doc.file.id}`, { token: tok[who] })).status, who).toBe(403)
      expect((await download(doc.file.filename, tok[who])).status, `download as ${who}`).toBe(403)
      expect((await rest('POST', '/committee-documents', { token: tok[who], body: { title: 'x', file: doc.file.id } })).status, `create as ${who}`).toBe(403)
    }
    expect((await download(doc.file.filename)).status, 'anonymous download').toBe(403)
    expect(await q.getDocumentsPage(user.editor)).toEqual({ denied: true })
    expect((await q.getDocumentsPage(user.bearer)) as { documents: unknown[] }).toMatchObject({ documents: [expect.objectContaining({ title: 'Insurance 2026' })] })

    const ok = await download(doc.file.filename, tok.bearer)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-disposition')).toMatch(/^attachment/)
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff')
    expect(ok.headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(ok.headers.get('cache-control')).toMatch(/no-store/)
    expect((await rest('GET', '/committee-documents', { token: tok.bearer })).status).toBe(200)
    expect((await rest('DELETE', `/committee-documents/${doc.id}`, { token: tok.bearer })).status).toBe(403)
    expect(await q.removeDocument(user.bearer, doc.id)).toEqual({ ok: false, code: 'forbidden' })
    expect((await rest('DELETE', `/committee-documents/${doc.id}`, { token: tok.admin })).status).toBe(200)
  })

  it('uploads are capped at 4 MB, restricted to the listed file types, and leave no orphan file behind', async () => {
    const big = new Uint8Array(OFFICE_FILE_MAX_BYTES + 1)
    expect(await q.addDocument(user.bearer, { title: 'Huge', category: 'other', meetingId: '', file: file('big.pdf', big) })).toEqual({ ok: false, code: 'file-big' })
    expect(await q.addDocument(user.bearer, { title: 'Empty', category: 'other', meetingId: '', file: file('empty.pdf', '') })).toEqual({ ok: false, code: 'file' })
    expect(await q.addDocument(user.bearer, { title: 'Script', category: 'other', meetingId: '', file: file('x.html', '<script>alert(1)</script>', 'text/html') })).toEqual({ ok: false, code: 'file' })
    expect(await q.addDocument(user.bearer, { title: 'Bad cat', category: 'secrets', meetingId: '', file: file('p.pdf', PDF) })).toEqual({ ok: false, code: 'category' })
    expect((await payload.count({ collection: 'office-files', overrideAccess: true })).totalDocs).toBe(0)
    expect((await payload.count({ collection: 'committee-documents', overrideAccess: true })).totalDocs).toBe(0)
  })

  it('handover: the ex-holder loses document access on the very next request (same token), the new login gains it, unchanged seats are untouched', async () => {
    const added = await q.addDocument(user.admin, { title: 'Constitution', category: 'governance', meetingId: '', file: file('constitution.pdf', PDF) })
    expect(added).toMatchObject({ ok: true })
    const filename = ((await payload.find({ collection: 'office-files', depth: 0, overrideAccess: true })).docs[0] as unknown as { filename: string }).filename
    // Before: the president's login opens documents (REST, Local API and download), with the one token used throughout.
    expect((await rest('GET', '/committee-documents', { token: tok.bearer })).status).toBe(200)
    expect((await download(filename, tok.bearer)).status).toBe(200)
    expect((await rest('GET', '/committee-documents', { token: tok.newbearer })).status).toBe(403)

    const annual = await newMeeting('admin', 'annual', '2026-11-17')
    // Jobs follow the seat: an action owned by the president seat.
    await q.addAction(user.admin, { meetingId: annual, itemId: '', text: 'Hand over the keys', ownerSeat: seats.president, ownerPerson: '', due: '2026-12-01' })

    expect(await q.handoverSeats(user.editor, { meetingId: annual, changes: [{ seatId: seats.president, personId: people.Newt, loginId: '' }] })).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.handoverSeats(user.bearer, { meetingId: annual, changes: [] })).toEqual({ ok: false, code: 'forbidden' })
    const selectorLogin = (user.selector as { id: number }).id
    expect(await q.handoverSeats(user.admin, { meetingId: annual, changes: [{ seatId: seats.president, personId: people.Newt, loginId: selectorLogin }] })).toEqual({ ok: false, code: 'login' })
    const ordinary = await newMeeting('admin', 'ordinary', '2026-11-24')
    expect(await q.handoverSeats(user.admin, { meetingId: ordinary, changes: [{ seatId: seats.president, personId: people.Newt, loginId: '' }] })).toEqual({ ok: false, code: 'not-annual' })

    const before = await payload.findByID({ collection: 'committee-seats', id: seats.secretary, depth: 0, overrideAccess: true })
    // A login picked for a seat whose holder is not changing is refused with a message, and nothing is saved.
    expect(
      await q.handoverSeats(user.admin, { meetingId: annual, changes: [{ seatId: seats.secretary, personId: people.Sam, loginId: String((user.newbearer as { id: number }).id) }] }),
    ).toEqual({ ok: false, code: 'login-unchanged' })
    const res = await q.handoverSeats(user.admin, {
      meetingId: annual,
      changes: [
        { seatId: seats.president, personId: people.Newt, loginId: String((user.newbearer as { id: number }).id) },
        { seatId: seats.secretary, personId: people.Sam, loginId: '' }, // unchanged
        { seatId: seats.treasurer, personId: 'vacant', loginId: '' },
      ],
    })
    expect(res).toMatchObject({ ok: true, n: 2 })

    const president = await payload.findByID({ collection: 'committee-seats', id: seats.president, depth: 0, overrideAccess: true })
    expect(president).toMatchObject({ holder: people.Newt, holderUser: (user.newbearer as { id: number }).id })
    expect(String(president.termStart)).toContain('2026-11-17')
    expect(president.termEnd ?? null).toBeNull()
    const treasurer = await payload.findByID({ collection: 'committee-seats', id: seats.treasurer, depth: 0, overrideAccess: true })
    expect(treasurer.holder ?? null).toBeNull()
    expect(treasurer.holderUser ?? null).toBeNull()
    expect(String(treasurer.termEnd)).toContain('2026-11-17')
    const after = await payload.findByID({ collection: 'committee-seats', id: seats.secretary, depth: 0, overrideAccess: true })
    expect(after.holderUser).toBe(before.holderUser)
    expect(after.updatedAt).toBe(before.updatedAt)

    // The ex-holder (same token, no re-login) is out; the new holder is in.
    expect((await rest('GET', '/committee-documents', { token: tok.bearer })).status).toBe(403)
    expect((await rest('GET', '/office-files', { token: tok.bearer })).status).toBe(403)
    expect((await download(filename, tok.bearer)).status).toBe(403)
    expect(await q.getDocumentsPage(user.bearer)).toEqual({ denied: true })
    expect((await rest('GET', '/committee-documents', { token: tok.newbearer })).status).toBe(200)
    expect((await download(filename, tok.newbearer)).status).toBe(200)
    expect((await payload.find({ collection: 'meetings', ...asUser('bearer') })).docs.every((m) => !m.restricted)).toBe(true)

    // The action stayed with the seat, whoever holds it now.
    const action = (await payload.find({ collection: 'meeting-actions', depth: 0, overrideAccess: true })).docs[0]
    expect(action.ownerSeat).toBe(seats.president)
    const view = (await q.getActionsPage(user.admin, seats.president))!.actions[0]
    expect(view.owner).toBe('President (Newt Newcomer)')

    // One audit row per changed seat: ids and a number, never a name.
    const audit = (await payload.find({ collection: 'office-audit-log', where: { action: { equals: 'handover' } }, pagination: false, depth: 0, overrideAccess: true })).docs
    expect(audit).toHaveLength(2)
    for (const row of audit) {
      expect(Object.keys(row.summary as object).sort()).toEqual(['date', 'from', 'meeting', 'seat', 'to'])
      expect(JSON.stringify(row.summary)).not.toMatch(/Pat|Newt|Sam|Tess/)
    }
    // The summary the page shows is computed from the seats.
    const summary = await q.currentOfficeBearers(user.admin)
    expect(summary!.seatHolders.join(' ')).toContain('President')
    expect(await q.currentOfficeBearers(user.editor)).toBeNull()
  })

  it('a seat whose term has ended, or whose login is disabled or a selector, gives no access', async () => {
    await payload.update({ collection: 'committee-seats', id: seats.president, data: { termEnd: '2020-01-01T12:00:00.000Z' }, overrideAccess: true })
    expect((await rest('GET', '/committee-documents', { token: tok.bearer })).status).toBe(403)
    await payload.update({ collection: 'committee-seats', id: seats.president, data: { termEnd: null }, overrideAccess: true })
    expect((await rest('GET', '/committee-documents', { token: tok.bearer })).status).toBe(200)
    // A selector named on an office-bearer seat is still nobody. (The seat form filters logins to admins and editors; this forces the row.)
    const { sql } = await import('@payloadcms/db-postgres/drizzle')
    await payload.db.drizzle.execute(sql.raw(`UPDATE "payload"."committee_seats" SET holder_user_id = ${(user.selector as { id: number }).id} WHERE id = ${seats.treasurer}`))
    expect((await rest('GET', '/committee-documents', { token: tok.selector })).status).toBe(403)
    expect(await q.getMeetingPage(user.selector, 1)).toBeNull()
    expect(await q.meetingStats(user.selector)).toBeNull()
  })

  it('seats: the committee reads them, only an admin edits them over REST', async () => {
    expect((await rest('GET', '/committee-seats', { token: tok.editor })).status).toBe(200)
    expect((await rest('GET', '/committee-seats')).status).toBe(403)
    expect((await rest('PATCH', `/committee-seats/${seats.president}`, { token: tok.editor, body: { officeBearer: false } })).status).toBe(403)
    expect((await rest('PATCH', `/committee-seats/${seats.president}`, { token: tok.bearer, body: { holderUser: (user.newbearer as { id: number }).id } })).status).toBe(403)
    expect((await rest('PATCH', `/committee-seats/${seats.president}`, { token: tok.admin, body: { handoverNote: 'Keys are in the safe' } })).status).toBe(200)
  })

  it('no meeting data is writable over REST, even by an office-bearer or an admin', async () => {
    const id = await newMeeting('admin', 'ordinary')
    for (const token of [tok.editor, tok.bearer, tok.admin]) {
      expect((await rest('PATCH', `/meetings/${id}`, { token, body: { restricted: false } })).status).toBe(403)
      expect((await rest('POST', '/meeting-actions', { token, body: { meeting: id, text: 'sneak', status: 'open' } })).status).toBe(403)
      expect((await rest('DELETE', `/meetings/${id}`, { token })).status).toBe(403)
    }
  })
})
