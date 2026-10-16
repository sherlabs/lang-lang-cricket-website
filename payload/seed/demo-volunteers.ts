import type { Payload } from 'payload'
import { noon } from '../../lib/office/fee-load'
import { seasonOfClubDate } from '../../lib/office/season'
import { DEFAULT_SHIFT_TYPES } from '../../lib/office/settings-defaults'
import { planConfirm, type AssignmentRow, type ShiftRow } from '../../lib/office/volunteers'

const CTX = { disableRevalidate: true } as const

const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Demo volunteer roster (wave D WP-3), written only when there are no volunteer weeks yet and the demo members exist. Six game days
 * relative to today: two past and confirmed (with hours, some of them paid), one coming up in two days with places still empty, one
 * the week after, and two drafts. About a dozen volunteers have answered for the open days. Invented people only. Jobs come from the
 * neutral default shift types, so a club that renamed them sees its own names on a fresh seed.
 */
export async function seedDemoVolunteers(payload: Payload, today: string): Promise<string> {
  if ((await payload.count({ collection: 'volunteer-weeks', overrideAccess: true })).totalDocs > 0) return 'volunteer weeks exist, skipped'
  const people = (
    await payload.find({ collection: 'members', where: { and: [{ status: { equals: 'active' } }, { roles: { in: ['volunteer', 'committee'] } }] }, pagination: false, depth: 0, sort: 'id', overrideAccess: true })
  ).docs.map((m) => m.id as number)
  if (people.length < 6) return 'too few volunteers, skipped'
  const admin = (await payload.find({ collection: 'users', where: { role: { equals: 'admin' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
  const adminId = (admin?.id as number | undefined) ?? null

  const plan = [
    { offset: -14, status: 'confirmed', label: 'Round 3' },
    { offset: -7, status: 'confirmed', label: 'Round 4' },
    { offset: 2, status: 'open', label: 'Round 5' },
    { offset: 9, status: 'open', label: 'Round 6' },
    { offset: 16, status: 'draft', label: null },
    { offset: 23, status: 'draft', label: null },
  ] as const
  // Who staffs what in the confirmed weeks: [shift index][person index]. The first Bar shift is paid in both weeks.
  const rosters: Record<number, number[][]> = { 0: [[0, 1], [2, 3], [4]], 1: [[5, 6], [7, 0], [1]], 2: [[2], [], [3]], 3: [[], [], []] }

  let weeks = 0
  let hours = 0
  for (const [wi, w] of plan.entries()) {
    const date = addDays(today, w.offset)
    const week = await payload.create({
      collection: 'volunteer-weeks',
      data: { season: seasonOfClubDate(date).name, date: noon(date), label: w.label, status: w.status, ...(w.status === 'confirmed' ? { confirmedAt: new Date().toISOString(), confirmedBy: adminId } : {}) } as never,
      overrideAccess: true,
      context: CTX,
      depth: 0,
    })
    weeks++
    const shifts: ShiftRow[] = []
    const assignments: AssignmentRow[] = []
    for (const [si, t] of DEFAULT_SHIFT_TYPES.entries()) {
      const shift = await payload.create({ collection: 'volunteer-shifts', data: { week: week.id, shiftTypeKey: t.key, labelSnapshot: t.label, hours: t.defaultHours, slots: t.defaultSlots } as never, overrideAccess: true, context: CTX, depth: 0 })
      shifts.push({ id: shift.id as number, weekId: week.id as number, shiftTypeKey: t.key, labelSnapshot: t.label, hours: t.defaultHours, slots: t.defaultSlots })
      for (const pi of rosters[wi]?.[si] ?? []) {
        const memberId = people[pi % people.length]
        // The bar is staffed by paid people on the two past game days; everything else is volunteer work.
        const kind = t.key === 'bar' && w.status === 'confirmed' ? 'paid' : 'volunteer'
        const state = w.status === 'confirmed' ? 'confirmed' : 'rostered'
        const a = await payload.create({ collection: 'volunteer-assignments', data: { shift: shift.id, member: memberId, kind, hours: t.defaultHours, state } as never, overrideAccess: true, context: CTX, depth: 0 })
        assignments.push({ id: a.id as number, shiftId: shift.id as number, memberId, kind, hours: t.defaultHours, state })
      }
    }
    if (w.status === 'confirmed') {
      for (const p of planConfirm(date, shifts, assignments, new Set()).post) {
        await payload.create({ collection: 'volunteer-hours', data: { member: p.memberId, date: noon(date), hours: p.hours, kind: p.kind, shiftTypeKey: p.shiftTypeKey, week: week.id, assignment: p.assignmentId, source: 'roster', recordedBy: adminId } as never, overrideAccess: true, context: CTX, depth: 0 })
        hours++
      }
    }
    // Answers for the weeks volunteers can still answer: a mix of yes, maybe and no, with a few notes.
    if (w.status === 'open') {
      const answers = ['yes', 'yes', 'maybe', 'no', 'yes', 'maybe', 'yes', 'no', 'yes', 'maybe', 'yes', 'yes']
      for (const [pi, memberId] of people.slice(0, 12).entries()) {
        const state = answers[(pi + wi) % answers.length]
        await payload.create({
          collection: 'volunteer-availability',
          data: { member: memberId, week: week.id, state, preferredShiftKeys: pi % 3 === 0 ? ['canteen'] : pi % 3 === 1 ? ['bar'] : [], note: state === 'maybe' && pi % 2 === 0 ? 'Only free after lunch' : null } as never,
          overrideAccess: true,
          context: CTX,
          depth: 0,
        })
      }
    }
  }
  // A working bee typed in by an admin: five people, a few hours each.
  const bee = addDays(today, -10)
  for (const memberId of people.slice(0, 5)) {
    await payload.create({ collection: 'volunteer-hours', data: { member: memberId, date: noon(bee), hours: 3, kind: 'volunteer', shiftTypeKey: null, source: 'manual', note: 'Working bee', recordedBy: adminId } as never, overrideAccess: true, context: CTX, depth: 0 })
    hours++
  }
  // One more person on the gate, so the gate has three different people and the report can show it as its own line.
  await payload.create({ collection: 'volunteer-hours', data: { member: people[5 % people.length], date: noon(addDays(today, -12)), hours: 2, kind: 'volunteer', shiftTypeKey: 'gate', source: 'manual', note: 'Gate cover', recordedBy: adminId } as never, overrideAccess: true, context: CTX, depth: 0 })
  hours++
  return `${weeks} weeks, ${hours} hours rows`
}
