import type { Payload } from 'payload'
import { noon } from '../../lib/office/fee-load'

const CTX = { disableRevalidate: true } as const

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

type SeedItem = { key: string; name: string; groupName?: string; size?: string; category: 'kit' | 'equipment' | 'consumables' | 'other'; reorderLevel?: number; returnable: boolean; location: string; received: number }

/**
 * Demo stock (wave D WP-7), written only when there are no stock items yet and at least four demo members who can be given kit.
 * Kit in sizes, caps that are given away, helmets, bats, a ball machine and consumables, with a handful of issues relative to today:
 * two kit items overdue back, one returned, one part returned and a few given away, and one item that is low (practice balls).
 * Invented items only.
 */
export async function seedDemoStock(payload: Payload, today: string): Promise<string> {
  if ((await payload.count({ collection: 'stock-items', overrideAccess: true })).totalDocs > 0) return 'stock items exist, skipped'
  const people = (
    await payload.find({ collection: 'members', where: { and: [{ status: { equals: 'active' } }, { roles: { in: ['player', 'volunteer', 'committee', 'coach'] } }] }, pagination: false, depth: 0, sort: 'id', overrideAccess: true })
  ).docs.map((m) => m.id as number)
  if (people.length < 4) return 'too few members, skipped'
  const admin = (await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const by = (admin?.id as number | undefined) ?? null

  const items: SeedItem[] = [
    ...(['S', 'M', 'L', 'XL'] as const).map((size): SeedItem => ({ key: `shirt-${size}`, name: 'Playing shirt', groupName: 'Playing shirt', size, category: 'kit', reorderLevel: 2, returnable: true, location: 'Kit store', received: 8 })),
    { key: 'cap', name: 'Club cap', category: 'kit', reorderLevel: 1, returnable: false, location: 'Kit store', received: 5 },
    { key: 'helmet-senior', name: 'Helmet', groupName: 'Helmet', size: 'Senior', category: 'equipment', reorderLevel: 2, returnable: true, location: 'Equipment shed', received: 6 },
    { key: 'helmet-youth', name: 'Helmet', groupName: 'Helmet', size: 'Youth', category: 'equipment', reorderLevel: 2, returnable: true, location: 'Equipment shed', received: 4 },
    { key: 'bat-junior', name: 'Bat', groupName: 'Bat', size: 'Junior', category: 'equipment', returnable: true, location: 'Equipment shed', received: 5 },
    { key: 'ball-machine', name: 'Ball machine', category: 'equipment', returnable: true, location: 'Equipment shed', received: 1 },
    { key: 'practice-balls', name: 'Practice balls', category: 'consumables', reorderLevel: 6, returnable: false, location: 'Equipment shed', received: 24 },
    { key: 'first-aid', name: 'First aid kit', category: 'other', reorderLevel: 1, returnable: false, location: 'Pavilion', received: 3 },
  ]
  const ids: Record<string, number> = {}
  for (const i of items) {
    const row = await payload.create({
      collection: 'stock-items',
      data: { name: i.name, groupName: i.groupName ?? null, size: i.size ?? null, category: i.category, unit: 'each', reorderLevel: i.reorderLevel ?? null, location: i.location, returnable: i.returnable, active: true } as never,
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    ids[i.key] = row.id
  }
  const move = (data: Record<string, unknown>) => payload.create({ collection: 'stock-movements', data: { recordedBy: by, ...data } as never, overrideAccess: true, depth: 0, context: CTX })
  for (const i of items) await move({ item: ids[i.key], kind: 'received', qty: i.received, date: noon(addDays(today, -120)), note: 'Opening stock' })
  // Practice balls wear out: 20 written off leaves 4, below the reorder level of 6.
  await move({ item: ids['practice-balls'], kind: 'written-off', qty: 20, date: noon(addDays(today, -15)), note: 'Split or lost shape' })

  const issue = async (key: string, who: number, qty: number, issuedAgo: number, dueIn: number | null, returnable: boolean) => {
    const issuedOn = addDays(today, -issuedAgo)
    const row = await payload.create({
      collection: 'stock-issues',
      data: { item: ids[key], member: who, qty, issuedOn: noon(issuedOn), dueBackOn: dueIn === null ? null : noon(addDays(today, dueIn)), returnable, recordedBy: by } as never,
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    await move({ item: ids[key], kind: 'issued', qty, date: noon(issuedOn), member: who, issue: row.id })
    return row.id
  }
  const back = (key: string, who: number, issueId: number, qty: number, ago: number) => move({ item: ids[key], kind: 'returned', qty, date: noon(addDays(today, -ago)), member: who, issue: issueId })

  await issue('helmet-senior', people[0], 1, 45, -20, true) // overdue
  await issue('helmet-youth', people[1], 1, 30, -6, true) // overdue
  const done = await issue('helmet-senior', people[2], 1, 50, -30, true)
  await back('helmet-senior', people[2], done, 1, 28) // returned
  const part = await issue('bat-junior', people[3], 2, 10, 20, true)
  await back('bat-junior', people[3], part, 1, 3) // part returned
  await issue('shirt-M', people[0], 1, 20, 60, true)
  await issue('cap', people[1], 2, 25, null, false) // given away
  await issue('cap', people[2], 1, 12, null, false)
  return `${items.length} items, 7 issues`
}
