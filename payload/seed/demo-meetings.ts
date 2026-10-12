import type { Payload } from 'payload'
import { buildMinutes, itemsFromTemplate, type MinutesInput } from '../../lib/office/meetings'
import { STARTER_TEMPLATES } from '../../lib/office/starter-meetings'

const CTX = { disableRevalidate: true } as const
const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** A tiny but valid PDF, so the demo documents open in any viewer. */
const pdf = (title: string): Buffer => Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] >>\nendobj\n% ${title.replace(/[^\\w ]/g, '')}\nxref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n9\n%%EOF\n`)

/**
 * Demo committee meetings (wave D WP-4), written only when there are no committee seats yet. Seats for the usual offices with
 * holders from the demo people (no logins: an admin links a login to a seat in Club office, then Meetings), the standard agendas, two
 * closed meetings (one with a restricted finance item), one planned yearly general meeting, a few actions (one overdue) and two
 * office-bearer documents. Invented content only.
 */
export async function seedDemoMeetings(payload: Payload, today: string): Promise<string> {
  if ((await payload.count({ collection: 'committee-seats', overrideAccess: true })).totalDocs > 0) return 'committee seats exist, skipped'
  const people = (await payload.find({ collection: 'people', pagination: false, depth: 0, sort: 'sortOrder', overrideAccess: true, select: { name: true } })).docs as unknown as { id: number; name: string }[]
  const titles = ['President', 'Vice-President', 'Secretary', 'Treasurer', 'Coach liaison', 'Ground and facilities']
  const seatIds: number[] = []
  const holders: (string | null)[] = []
  for (const [i, title] of titles.entries()) {
    const person = people[i] ?? null
    const seat = await payload.create({
      collection: 'committee-seats',
      data: { title, sortOrder: (i + 1) * 10, holder: person?.id ?? null, officeBearer: i < 4, termStart: `${addDays(today, -200)}T12:00:00.000Z`, handoverNote: i === 3 ? 'Bank statements are reconciled monthly.' : '' },
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    seatIds.push(seat.id as number)
    holders.push(person?.name ?? null)
  }
  const tpl: Record<string, number> = {}
  for (const t of STARTER_TEMPLATES) {
    const row = await payload.create({ collection: 'meeting-templates', data: { name: t.name, kind: t.kind, items: t.items.map((i) => ({ title: i.title, kind: i.kind, defaultNotes: i.defaultNotes ?? '', restricted: Boolean(i.restricted) })) }, overrideAccess: true, depth: 0, context: CTX })
    tpl[t.kind] = row.id as number
  }

  const seatLabel = (i: number) => `${titles[i]}${holders[i] ? ` (${holders[i]})` : ''}`
  /** Writes a meeting from the ordinary template, the way the Meetings page does, with the given notes per item kind. */
  async function meeting(offset: number, title: string, kind: 'ordinary' | 'annual', status: 'closed' | 'planned', notes: Record<string, string>, extra: { motion?: string; action?: { text: string; seat: number; due: string; item: string }[]; financeNote?: string } = {}) {
    const date = addDays(today, offset)
    const template = STARTER_TEMPLATES.find((t) => t.kind === kind)!
    const items = itemsFromTemplate(template)
    const m = await payload.create({
      collection: 'meetings',
      data: { title, kind, startsAt: `${date}T19:00:00.000Z`, venue: 'Clubrooms', status, restricted: false, chairSeat: seatIds[0], minuteTakerSeat: seatIds[2], minutesStatus: 'draft' },
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    const itemRows: { id: number; kind: string; order: number; title: string; restricted: boolean }[] = []
    for (const it of items) {
      const noteFor = it.kind === 'financial' ? (extra.financeNote ?? '') : (notes[it.kind] ?? '')
      const row = await payload.create({ collection: 'meeting-items', data: { meeting: m.id, order: it.order, title: it.title, kind: it.kind, notes: noteFor, restricted: it.restricted, effectiveRestricted: it.restricted }, overrideAccess: true, depth: 0, context: CTX })
      itemRows.push({ id: row.id as number, kind: it.kind, order: it.order, title: it.title, restricted: it.restricted })
    }
    for (const [i, id] of seatIds.entries()) {
      const holder = (await payload.findByID({ collection: 'committee-seats', id, depth: 0, overrideAccess: true })).holder
      if (holder) await payload.create({ collection: 'meeting-attendance', data: { meeting: m.id, person: holder as number, state: status === 'closed' && i === 5 ? 'apology' : 'present', effectiveRestricted: false }, overrideAccess: true, depth: 0, context: CTX })
    }
    const motionItem = itemRows.find((i) => i.kind === 'general')
    if (extra.motion && motionItem) await payload.create({ collection: 'meeting-motions', data: { meeting: m.id, item: motionItem.id, text: extra.motion, votesFor: 5, votesAgainst: 0, abstain: 1, result: 'carried', effectiveRestricted: false }, overrideAccess: true, depth: 0, context: CTX })
    for (const a of extra.action ?? []) {
      const item = itemRows.find((i) => i.kind === a.item) ?? itemRows[0]
      await payload.create({ collection: 'meeting-actions', data: { meeting: m.id, item: item.id, text: a.text, ownerSeat: seatIds[a.seat], due: `${a.due}T12:00:00.000Z`, status: 'open', effectiveRestricted: item.restricted }, overrideAccess: true, depth: 0, context: CTX })
    }
    if (status === 'closed') {
      const input: MinutesInput = {
        title,
        when: date,
        venue: 'Clubrooms',
        chair: seatLabel(0),
        minuteTaker: seatLabel(2),
        attendance: seatIds.map((_, i) => ({ name: holders[i] ?? titles[i], state: i === 5 ? ('apology' as const) : ('present' as const) })),
        items: itemRows.map((i) => ({ order: i.order, title: i.title, notes: i.kind === 'financial' ? (extra.financeNote ?? null) : (notes[i.kind] ?? null), outcome: null, restricted: i.restricted, motions: [], actions: [] })),
      }
      await payload.update({ collection: 'meetings', id: m.id, data: { minutesText: buildMinutes(input, { includeRestricted: false }), closedAt: new Date().toISOString() }, overrideAccess: true, depth: 0, context: CTX })
    }
    return m.id as number
  }

  const first = await meeting(-42, 'Committee meeting', 'ordinary', 'closed', { business: 'Quotes for the new scoreboard to be collected.', general: 'Working bee date agreed.' }, {
    motion: 'That the working bee be held before round 1.',
    financeNote: 'Treasurer reported a healthy balance; two invoices to pay.',
    action: [
      { text: 'Collect three quotes for the scoreboard', seat: 5, due: addDays(today, -14), item: 'business' },
      { text: 'Book the clubrooms for the presentation night', seat: 2, due: addDays(today, 14), item: 'general' },
    ],
  })
  await payload.update({ collection: 'meetings', id: first, data: { minutesStatus: 'approved' }, overrideAccess: true, depth: 0, context: CTX })
  const second = await meeting(-14, 'Committee meeting', 'ordinary', 'closed', { business: 'Scoreboard quotes still outstanding.', general: 'Insurance renewal discussed.' }, {
    financeNote: 'Insurance premium to be paid before the end of the month.',
    action: [{ text: 'Pay the insurance premium', seat: 3, due: addDays(today, 5), item: 'financial' }],
  })
  await payload.update({ collection: 'meetings', id: first, data: { approvedAtMeeting: second }, overrideAccess: true, depth: 0, context: CTX })
  await meeting(30, 'Yearly general meeting', 'annual', 'planned', {})

  const adminDocs: [string, 'insurance' | 'governance', string][] = [
    ['Insurance certificate', 'insurance', 'insurance-certificate.pdf'],
    ['Club constitution', 'governance', 'club-constitution.pdf'],
  ]
  const admin = (await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  for (const [title, category, name] of adminDocs) {
    const buffer = pdf(title)
    const f = await payload.create({ collection: 'office-files', data: {}, file: { data: buffer, mimetype: 'application/pdf', name, size: buffer.length }, overrideAccess: true, depth: 0, context: CTX })
    await payload.create({ collection: 'committee-documents', data: { title, category, file: f.id as number, uploadedBy: (admin?.id as number | undefined) ?? undefined }, overrideAccess: true, depth: 0, context: CTX })
  }
  return `${titles.length} seats, ${STARTER_TEMPLATES.length} agendas, 3 meetings, ${adminDocs.length} documents`
}
