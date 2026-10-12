import type { Payload } from 'payload'
import { planStarterJobs, planStarterPlan } from '../../lib/office/diary'
import { seasonChoices } from '../../lib/office/season'
import { STARTER_JOBS } from '../../lib/office/starter-diary'
import { STARTER_PILLARS } from '../../lib/office/starter-plan'

const CTX = { disableRevalidate: true } as const
const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const noon = (d: string) => `${d}T12:00:00.000Z`

/** Which seat title owns which kind of standard job in the demo (seats come from the demo meetings seed; a missing seat leaves the job without an owner). */
const OWNER_BY_CATEGORY: Record<string, string> = { registration: 'Secretary', governance: 'President', insurance: 'Treasurer', permits: 'Secretary', finance: 'Treasurer', ground: 'Ground and facilities', events: 'Vice-President', other: 'Secretary' }

/**
 * Demo season diary and strategic plan (wave D WP-5), written only when there are no diary jobs yet. The standard jobs for the current
 * season with a spread of states (two overdue, one blocked, several done, the rest ahead), owners from the demo seats, the starter plan
 * with a few jobs linked to two objectives so the progress shows. Invented content only; the standard jobs and plan are generic.
 */
export async function seedDemoDiary(payload: Payload, today: string): Promise<string> {
  if ((await payload.count({ collection: 'diary-jobs', overrideAccess: true })).totalDocs > 0) return 'diary jobs exist, skipped'
  const season = seasonChoices(today, 1)[0]
  const seatDocs = (await payload.find({ collection: 'committee-seats', pagination: false, depth: 0, overrideAccess: true, select: { title: true } })).docs as unknown as { id: number; title: string }[]
  const seatId = (title: string): number | null => seatDocs.find((s) => s.title === title)?.id ?? null

  const ops = planStarterJobs(season, STARTER_JOBS, [])
  // A fixed spread of states, picked by key so the demo looks the same every time.
  const overdue: Record<string, number> = { 'insurance-renewal': -12, 'permit-renewals': -5 }
  const blocked = 'body-registration-fees'
  const finished = new Set(['registration-open', 'equipment-check', 'ground-preparation'])
  const created = new Map<string, number>()
  for (const op of ops) {
    let due = op.due
    let status: 'todo' | 'blocked' | 'done' = 'todo'
    let blockedReason = ''
    if (op.sourceKey in overdue) due = addDays(today, overdue[op.sourceKey])
    else if (op.sourceKey === blocked) {
      due = addDays(today, 20)
      status = 'blocked'
      blockedReason = 'Waiting for the invoice from the governing body'
    } else if (finished.has(op.sourceKey)) {
      status = 'done'
      due = due < today ? due : addDays(today, -3)
    } else if (due < today) {
      // Anything else that falls before today in this demo has been dealt with.
      status = 'done'
    }
    const row = await payload.create({
      collection: 'diary-jobs',
      data: {
        title: op.title,
        season,
        category: op.category,
        due: noon(due),
        ownerSeat: op.sourceKey === 'awards-event' ? null : seatId(OWNER_BY_CATEGORY[op.category]),
        budgetCents: op.sourceKey === 'insurance-renewal' ? 180000 : op.sourceKey === 'awards-event' ? 150000 : op.sourceKey === 'working-bee' ? 40000 : null,
        actualCents: op.sourceKey === 'insurance-renewal' ? 172500 : null,
        status,
        blockedReason,
        repeatsYearly: op.repeatsYearly,
        notes: op.notes,
        sourceKey: op.sourceKey,
      },
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    created.set(op.sourceKey, row.id as number)
  }

  const plan = planStarterPlan(STARTER_PILLARS, [], [])
  const pillarId = new Map<string, number>()
  for (const p of plan.pillars) pillarId.set(p.key, (await payload.create({ collection: 'plan-pillars', data: { title: p.title, summary: p.summary, sortOrder: p.sortOrder, sourceKey: p.key }, overrideAccess: true, depth: 0, context: CTX })).id as number)
  const objectiveId = new Map<string, number>()
  for (const o of plan.objectives) {
    objectiveId.set(o.key, (await payload.create({ collection: 'plan-objectives', data: { pillar: pillarId.get(o.pillarKey) as number, title: o.title, progressNote: o.progressNote, sortOrder: o.sortOrder, status: 'not-started', sourceKey: o.key }, overrideAccess: true, depth: 0, context: CTX })).id as number)
  }
  // Progress on two objectives: the ground objective (two of three linked jobs done) and the participation objective (one of two).
  const link = async (jobKey: string, objectiveKey: string) => {
    const id = created.get(jobKey)
    const objective = objectiveId.get(objectiveKey)
    if (id && objective) await payload.update({ collection: 'diary-jobs', id, data: { objective } as never, overrideAccess: true, depth: 0, context: CTX })
  }
  await link('ground-preparation', 'facilities-ground')
  await link('equipment-check', 'facilities-equipment')
  await link('working-bee', 'facilities-ground')
  await link('registration-open', 'participation-juniors')
  await link('awards-event', 'community-events')
  const facilities = objectiveId.get('facilities-ground')
  if (facilities) await payload.update({ collection: 'plan-objectives', id: facilities, data: { status: 'on-track', progressNote: 'Pitches are ready; the working bee is booked.', budgetCents: 300000, targetDate: noon(addDays(today, 90)) } as never, overrideAccess: true, depth: 0, context: CTX })
  const juniors = objectiveId.get('participation-juniors')
  if (juniors) await payload.update({ collection: 'plan-objectives', id: juniors, data: { status: 'on-track', progressNote: 'Registration is open; the junior clinic is being planned.' } as never, overrideAccess: true, depth: 0, context: CTX })
  return `${ops.length} standard jobs for ${season}, ${plan.pillars.length} pillars and ${plan.objectives.length} objectives`
}
