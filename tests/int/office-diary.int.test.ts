import type { Payload } from 'payload'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCollection, destroyTestPayload, getTestPayload, rest, tokenFor } from './helpers'
import { STARTER_JOBS } from '@/lib/office/starter-diary'
import { STARTER_PILLARS } from '@/lib/office/starter-plan'
import { nextSeasonName } from '@/lib/office/diary'
import { seasonChoices } from '@/lib/office/season'
import { currentClubDate } from '@/lib/selection/club-date'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), revalidatePath: vi.fn(), unstable_cache: (fn: unknown) => fn }))

/**
 * Season diary and strategic plan (wave D WP-5) against real Postgres: the committee edits, selectors and anonymous callers get
 * nothing, the standard jobs and the starter plan are idempotent and never overwrite an edit, the rules hold on the native
 * form path too, and a job follows its seat through the yearly handover.
 */
const today = currentClubDate()
const addDays = (n: number): string => {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const season = seasonChoices(today, 1)[0]

describe('season diary and plan', () => {
  let payload: Payload
  const user: Record<string, unknown> = {}
  const tok: Record<string, string> = {}
  let q: typeof import('@/lib/diary-office-queries')
  let m: typeof import('@/lib/meetings-office-queries')
  let seats: Record<string, number> = {}
  let people: Record<string, number> = {}

  const create = (collection: string, data: Record<string, unknown>) =>
    payload.create({ collection: collection as never, data: data as never, overrideAccess: true, depth: 0, context: { disableRevalidate: true } }) as Promise<{ id: number } & Record<string, unknown>>
  const jobs = async (where: Record<string, unknown> = {}) => (await payload.find({ collection: 'diary-jobs', where: where as never, pagination: false, depth: 0, overrideAccess: true, sort: 'title' })).docs as unknown as Record<string, unknown>[]
  const addJob = (who: string, over: Record<string, unknown> = {}) => q.addJob(user[who], { title: 'Job', season, category: 'other', due: addDays(30), ownerSeat: String(seats.president), ...over })
  const wipe = async () => {
    for (const c of ['diary-jobs', 'plan-objectives', 'plan-pillars', 'meeting-actions', 'meeting-motions', 'meeting-attendance', 'meeting-items', 'meetings', 'meeting-templates', 'committee-seats', 'people', 'office-audit-log'] as const) await clearCollection(payload, c)
  }

  beforeAll(async () => {
    payload = await getTestPayload()
    await clearCollection(payload, 'users')
    for (const role of ['admin', 'editor', 'selector'] as const) tok[role] = await tokenFor(payload, role)
    tok.newholder = await tokenFor(payload, 'editor', 'newholder@example.com')
    for (const [key, email] of [['admin', 'admin@example.com'], ['editor', 'editor@example.com'], ['selector', 'selector@example.com'], ['newholder', 'newholder@example.com']] as const) {
      const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })
      user[key] = { ...(found.docs[0] as object), collection: 'users' }
    }
    q = await import('@/lib/diary-office-queries')
    m = await import('@/lib/meetings-office-queries')
  }, 120_000)
  afterAll(async () => {
    await wipe().catch(() => undefined)
    await clearCollection(payload, 'users')
    await destroyTestPayload(payload)
  })
  beforeEach(async () => {
    await wipe()
    people = {}
    for (const n of ['Pat President', 'Sam Secretary', 'Newt Newcomer']) people[n.split(' ')[0]] = (await create('people', { name: n, role: n.split(' ')[1] })).id
    seats = {}
    seats.president = (await create('committee-seats', { title: 'President', sortOrder: 1, holder: people.Pat, holderUser: (user.editor as { id: number }).id })).id
    seats.secretary = (await create('committee-seats', { title: 'Secretary', sortOrder: 2, holder: people.Sam })).id
  })

  it('selectors and anonymous callers get nothing from the data layer or the REST API', async () => {
    expect(await q.getDiaryPage(user.selector, {})).toBeNull()
    expect(await q.getPlanPage(user.selector)).toBeNull()
    expect(await q.diaryFigures(user.selector)).toBeNull()
    expect(await q.diaryFigures(undefined)).toBeNull()
    expect(await addJob('selector')).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.addStarterJobs(user.selector, season)).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.addStarterPlan(user.selector)).toEqual({ ok: false, code: 'forbidden' })
    expect(await q.copyRepeatingJobs(undefined, season)).toEqual({ ok: false, code: 'forbidden' })
    for (const path of ['/diary-jobs', '/plan-pillars', '/plan-objectives']) {
      expect((await rest('GET', path, { token: tok.selector })).status, path).toBe(403)
      expect((await rest('GET', path)).status, `${path} anonymous`).toBe(403)
      expect((await rest('GET', path, { token: tok.editor })).status, `${path} editor`).toBe(200)
    }
  })

  it('the standard jobs are added once; re-running adds none, and an edit is never overwritten', async () => {
    const first = await q.addStarterJobs(user.editor, season)
    expect(first).toMatchObject({ ok: true, n: STARTER_JOBS.length })
    expect(await jobs()).toHaveLength(STARTER_JOBS.length)
    // The club renames one, finishes one and assigns one; running again must leave all of that alone.
    const rows = await jobs()
    const renamed = rows.find((r) => r.sourceKey === STARTER_JOBS[0].key)!
    await payload.update({ collection: 'diary-jobs', id: renamed.id as number, data: { title: 'Our own title', status: 'in-progress', ownerSeat: seats.secretary } as never, overrideAccess: true, context: { disableRevalidate: true } })
    expect(await q.addStarterJobs(user.admin, season)).toMatchObject({ ok: true, n: 0, notice: 'starter-none' })
    const after = await jobs()
    expect(after).toHaveLength(STARTER_JOBS.length)
    const kept = after.find((r) => r.id === renamed.id)!
    expect(kept).toMatchObject({ title: 'Our own title', status: 'in-progress' })
    // Another season gets its own set.
    const next = nextSeasonName(season)!
    expect(await q.addStarterJobs(user.editor, next)).toMatchObject({ ok: true, n: STARTER_JOBS.length })
    expect(await jobs()).toHaveLength(STARTER_JOBS.length * 2)
    expect(await q.addStarterJobs(user.editor, 'whenever')).toEqual({ ok: false, code: 'season' })
  })

  it('a blocked job needs a reason on every path, and done stamps the day (club time) and reopening clears it', async () => {
    expect(await addJob('editor', { title: 'Renew insurance' })).toMatchObject({ ok: true })
    const [job] = await jobs()
    const id = job.id as number
    expect(await q.setJobStatus(user.editor, { id, status: 'blocked', reason: '' })).toEqual({ ok: false, code: 'reason' })
    // The native editor path (what an editor's form posts), checked by the collection hook.
    await expect(payload.update({ collection: 'diary-jobs', id, data: { status: 'blocked' } as never, user: user.editor as never, overrideAccess: false })).rejects.toBeTruthy()
    expect(await q.setJobStatus(user.editor, { id, status: 'blocked', reason: 'Waiting for a quote' })).toMatchObject({ ok: true })
    expect(await jobs()).toMatchObject([{ status: 'blocked', blockedReason: 'Waiting for a quote' }])
    expect(await q.setJobStatus(user.editor, { id, status: 'done' })).toMatchObject({ ok: true })
    const done = (await jobs())[0]
    expect(done).toMatchObject({ status: 'done', blockedReason: '' })
    expect(String(done.doneOn).slice(0, 10)).toBe(today)
    expect(await q.setJobStatus(user.editor, { id, status: 'todo' })).toMatchObject({ ok: true })
    expect((await jobs())[0].doneOn).toBeNull()
    expect(await q.setJobStatus(user.editor, { id, status: 'nonsense' })).toEqual({ ok: false, code: 'status' })
    expect(await q.setJobStatus(user.editor, { id: 'x', status: 'done' })).toEqual({ ok: false, code: 'not-found' })
  })

  it('the native form path cannot save a bad season or set the standard-item code', async () => {
    await expect(payload.create({ collection: 'diary-jobs', data: { title: 'Bad', season: '2026-27' } as never, user: user.editor as never, overrideAccess: false })).rejects.toBeTruthy()
    const viaRest = await rest('POST', '/diary-jobs', { token: tok.editor, body: { title: 'Sneaky', season, sourceKey: 'registration-open' } })
    expect(viaRest.status).toBe(201)
    expect((await jobs({ title: { equals: 'Sneaky' } }))[0].sourceKey ?? null).toBeNull()
    expect((await rest('DELETE', `/diary-jobs/${viaRest.json.doc.id}`, { token: tok.editor })).status).toBe(403)
    expect((await rest('DELETE', `/diary-jobs/${viaRest.json.doc.id}`, { token: tok.admin })).status).toBe(200)
  })

  it('quick add checks the season, date, seat and amount', async () => {
    expect(await addJob('editor', { title: '' })).toEqual({ ok: false, code: 'title' })
    expect(await addJob('editor', { season: '1999' })).toEqual({ ok: false, code: 'season' })
    expect(await addJob('editor', { due: 'soon' })).toEqual({ ok: false, code: 'date' })
    expect(await addJob('editor', { ownerSeat: '999999' })).toEqual({ ok: false, code: 'seat' })
    expect(await addJob('editor', { budget: '-4' })).toEqual({ ok: false, code: 'amount' })
    expect(await addJob('editor', { objective: '999999' })).toEqual({ ok: false, code: 'objective' })
    expect(await jobs()).toHaveLength(0)
    expect(await addJob('editor', { budget: '120.50' })).toMatchObject({ ok: true })
    expect((await jobs())[0]).toMatchObject({ budgetCents: 12050, status: 'todo' })
  })

  it('callouts: overdue, blocked and unowned jobs are counted, a finished job clears the line, and the diary filter finds the same jobs', async () => {
    await addJob('editor', { title: 'Late one', due: addDays(-3) })
    await addJob('editor', { title: 'Late two', due: addDays(-1), ownerSeat: '' }) // overdue and unowned
    await addJob('editor', { title: 'Stuck', due: addDays(40) })
    await addJob('editor', { title: 'Vacant seat job', due: addDays(40), ownerSeat: String(seats.president) })
    const stuck = (await jobs({ title: { equals: 'Stuck' } }))[0].id as number
    await q.setJobStatus(user.editor, { id: stuck, status: 'blocked', reason: 'No answer yet' })
    expect(await q.diaryFigures(user.editor)).toEqual({ overdue: 2, blocked: 1, unowned: 1 })
    // An old season's overdue job counts too (stated in the wording), and the filter without a season shows every season.
    await q.addJob(user.editor, { title: 'Last year', season: seasonChoices(today, 2)[1], category: 'other', due: addDays(-200), ownerSeat: String(seats.president) })
    expect((await q.diaryFigures(user.editor))!.overdue).toBe(3)
    const overdue = await q.getDiaryPage(user.editor, { filter: 'overdue' })
    expect(overdue!.season).toBe('all')
    expect(overdue!.months.flatMap((mm) => mm.jobs).map((j) => j.title).sort()).toEqual(['Last year', 'Late one', 'Late two'])
    // Marking one done clears the line.
    await q.setJobStatus(user.editor, { id: (await jobs({ title: { equals: 'Late one' } }))[0].id as number, status: 'done' })
    expect((await q.diaryFigures(user.editor))!.overdue).toBe(2)
    const page = await q.getDiaryPage(user.editor, { season, filter: 'unowned' })
    expect(page!.months.flatMap((mm) => mm.jobs).map((j) => j.title)).toEqual(['Late two'])
    // Fixing the owner clears it.
    expect(await q.setJobOwner(user.editor, { id: (await jobs({ title: { equals: 'Late two' } }))[0].id as number, seat: String(seats.secretary) })).toMatchObject({ ok: true })
    expect((await q.diaryFigures(user.editor))!.unowned).toBe(0)
  })

  it('"Mine" is the jobs on the signed-in login\'s seat, and a job follows its seat through the yearly handover', async () => {
    await addJob('editor', { title: 'Keys', ownerSeat: String(seats.president), due: addDays(2) })
    expect((await q.getDiaryPage(user.editor, { filter: 'mine' }))!.counts.mine).toBe(1)
    expect((await q.getDiaryPage(user.newholder, { filter: 'mine' }))!.counts.mine).toBe(0)
    const jobBefore = (await jobs())[0]

    expect(await m.addStandardTemplates(user.admin)).toMatchObject({ ok: true })
    const tpl = (await payload.find({ collection: 'meeting-templates', where: { kind: { equals: 'annual' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    const created = await m.createMeeting(user.admin, { templateId: tpl.id, date: '2026-11-17', time: '19:00', title: '', venue: '' })
    const meetingId = (created as { id: number }).id
    // The president seat changes hands and the new holder gets the login.
    expect(await m.handoverSeats(user.admin, { meetingId, changes: [{ seatId: seats.president, personId: people.Newt, loginId: String((user.newholder as { id: number }).id) }] })).toMatchObject({ ok: true, n: 1 })
    const jobAfter = (await jobs())[0]
    expect(jobAfter.id).toBe(jobBefore.id)
    expect(jobAfter.ownerSeat).toBe(seats.president) // the job stays with the seat
    expect((await q.getDiaryPage(user.newholder, { filter: 'mine' }))!.counts.mine).toBe(1)
    expect((await q.getDiaryPage(user.editor, { filter: 'mine' }))!.counts.mine).toBe(0)
    const view = (await q.getDiaryPage(user.admin, { season }))!.months.flatMap((mm) => mm.jobs)[0]
    expect(view.ownerLabel).toContain('Newt Newcomer')
    // A vacant seat means the job has no owner again.
    expect((await q.diaryFigures(user.admin))!.unowned).toBe(0)
    expect(await m.handoverSeats(user.admin, { meetingId, changes: [{ seatId: seats.president, personId: 'vacant', loginId: '' }] })).toMatchObject({ ok: true })
    expect((await q.diaryFigures(user.admin))!.unowned).toBe(1)
  })

  it('copying repeating jobs to the next season is idempotent, starts them as to do and keeps the owner', async () => {
    expect(await q.addStarterJobs(user.editor, season)).toMatchObject({ ok: true })
    const rows = await jobs()
    await q.setJobStatus(user.editor, { id: rows[0].id as number, status: 'done' })
    await addJob('editor', { title: 'One-off tidy', due: addDays(5) }) // does not repeat
    const owner = rows[1]
    await payload.update({ collection: 'diary-jobs', id: owner.id as number, data: { ownerSeat: seats.secretary, budgetCents: 7700 } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const next = nextSeasonName(season)!
    expect(await q.copyRepeatingJobs(user.editor, season)).toMatchObject({ ok: true, n: STARTER_JOBS.length, notice: 'copied' })
    expect(await q.copyRepeatingJobs(user.editor, season)).toMatchObject({ ok: true, n: 0, notice: 'copied-none' })
    const copies = await jobs({ season: { equals: next } })
    expect(copies).toHaveLength(STARTER_JOBS.length)
    expect(copies.every((c) => c.status === 'todo' && c.doneOn == null)).toBe(true)
    const copyOfOwner = copies.find((c) => c.title === owner.title)!
    expect(copyOfOwner).toMatchObject({ ownerSeat: seats.secretary, budgetCents: 7700, repeatsYearly: true })
    expect(await q.copyRepeatingJobs(user.editor, 'nonsense')).toEqual({ ok: false, code: 'season' })
    // Adding the standard jobs to the new season afterwards does not double up.
    expect(await q.addStarterJobs(user.editor, next)).toMatchObject({ ok: true, n: 0 })
  })

  it('the starter plan is added once and re-running never changes an edit; progress rolls up from linked jobs', async () => {
    expect(await q.addStarterPlan(user.editor)).toMatchObject({ ok: true, n: STARTER_PILLARS.length + STARTER_PILLARS.reduce((n, p) => n + p.objectives.length, 0) })
    expect(await q.addStarterPlan(user.admin)).toMatchObject({ ok: true, n: 0, notice: 'plan-starter-none' })
    expect((await payload.count({ collection: 'plan-pillars', overrideAccess: true })).totalDocs).toBe(STARTER_PILLARS.length)
    const objective = (await payload.find({ collection: 'plan-objectives', where: { sourceKey: { equals: 'participation-juniors' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    expect(await q.saveObjective(user.editor, { id: objective.id, status: 'on-track', progressNote: 'Clinic booked', budget: '3000' })).toMatchObject({ ok: true })
    expect(await q.addStarterPlan(user.editor)).toMatchObject({ ok: true, n: 0 })
    expect((await payload.findByID({ collection: 'plan-objectives', id: objective.id, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>).toMatchObject({ status: 'on-track', progressNote: 'Clinic booked', budgetCents: 300000 })

    await addJob('editor', { title: 'Run a clinic', objective: String(objective.id), budget: '1200' })
    await addJob('editor', { title: 'Buy bats', objective: String(objective.id), budget: '2500' })
    await addJob('editor', { title: 'Unlinked job' })
    const [clinic] = await jobs({ title: { equals: 'Run a clinic' } })
    await q.setJobStatus(user.editor, { id: clinic.id as number, status: 'done' })
    await payload.update({ collection: 'diary-jobs', id: clinic.id as number, data: { actualCents: 110000 } as never, overrideAccess: true, context: { disableRevalidate: true } })
    const plan = (await q.getPlanPage(user.editor))!
    const obj = plan.pillars.flatMap((p) => p.objectives).find((o) => o.id === objective.id)!
    expect(obj.progress).toMatchObject({ total: 2, done: 1, percent: 50, jobBudgetCents: 370000, actualCents: 110000, budgetWarning: true })
    expect(obj.progressText).toMatch(/^1 of 2 jobs done, .*1,100\.00 spent of .*3,000\.00$/)
    expect(obj.jobs.map((j) => j.title).sort()).toEqual(['Buy bats', 'Run a clinic'])
    expect(plan.unlinked).toBe(1)
    expect(plan.canAddStarter).toBe(false)
    expect(await q.saveObjective(user.editor, { id: objective.id, status: 'secret', progressNote: '' })).toEqual({ ok: false, code: 'status' })
    expect(await q.addObjective(user.editor, { title: 'New aim', pillar: String((await payload.find({ collection: 'plan-pillars', limit: 1, depth: 0, overrideAccess: true })).docs[0].id), targetDate: '2027-03-01', budget: '500' })).toMatchObject({ ok: true })
    expect(await q.addObjective(user.editor, { title: 'Orphan', pillar: '999999' })).toEqual({ ok: false, code: 'not-found' })
    expect(await q.addPillar(user.editor, { title: 'Own pillar', summary: 'x' })).toMatchObject({ ok: true })
  })
})
