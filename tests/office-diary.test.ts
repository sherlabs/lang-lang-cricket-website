import { describe, expect, it } from 'vitest'
import {
  diaryStats,
  dueFromOffset,
  isUnowned,
  jobOverBudget,
  jobStanding,
  nextSeasonName,
  objectiveProgress,
  oneYearOn,
  planCopyToNextSeason,
  planStarterJobs,
  planStarterPlan,
  validateAmount,
  validateBlockedReason,
  validateJobInput,
  validateObjectiveInput,
  type SourceJob,
} from '../lib/office/diary'
import { STARTER_JOBS } from '../lib/office/starter-diary'
import { STARTER_PILLARS } from '../lib/office/starter-plan'
import { localDateOf } from '../lib/selection/weekend'
import { notificationLines } from '../lib/admin/notifications'
import { officeCopy } from '../payload/admin/copy'
import { resolveOfficeSettings } from '../lib/office/settings'

const SOUTH = { startMonth: 7, format: 'split' as const }
const NORTH = { startMonth: 1, format: 'single' as const }

describe('jobStanding', () => {
  it('is overdue the day after the due date and not on the due date itself', () => {
    expect(jobStanding({ status: 'todo', due: '2026-10-12' }, '2026-10-12')).toBe('due-soon')
    expect(jobStanding({ status: 'todo', due: '2026-10-12' }, '2026-10-13')).toBe('overdue')
  })
  it('uses the club day passed in, not the server clock: one instant is a different day in different zones', () => {
    const instant = new Date('2026-10-12T23:30:00Z')
    const melbourne = localDateOf(instant, 'Australia/Melbourne') // already the 13th there
    const london = localDateOf(instant, 'America/Los_Angeles')
    expect(melbourne).toBe('2026-10-13')
    expect(london).toBe('2026-10-12')
    const job = { status: 'todo' as const, due: '2026-10-12' }
    expect(jobStanding(job, melbourne)).toBe('overdue')
    expect(jobStanding(job, london)).toBe('due-soon')
  })
  it('done wins, then overdue wins over blocked, then blocked, then due soon within the lead days', () => {
    expect(jobStanding({ status: 'done', due: '2020-01-01' }, '2026-10-12')).toBe('done')
    expect(jobStanding({ status: 'blocked', due: '2026-10-01' }, '2026-10-12')).toBe('overdue')
    expect(jobStanding({ status: 'blocked', due: '2026-12-01' }, '2026-10-12')).toBe('blocked')
    expect(jobStanding({ status: 'todo', due: '2026-10-26' }, '2026-10-12', 14)).toBe('due-soon')
    expect(jobStanding({ status: 'todo', due: '2026-10-27' }, '2026-10-12', 14)).toBe('open')
    expect(jobStanding({ status: 'in-progress', due: '2026-10-20' }, '2026-10-12', 3)).toBe('open')
    expect(jobStanding({ status: 'todo', due: null }, '2026-10-12')).toBe('open')
  })
  it('reads a stored timestamp by its first ten characters', () => {
    expect(jobStanding({ status: 'todo', due: '2026-10-11T12:00:00.000Z' }, '2026-10-12')).toBe('overdue')
  })
})

describe('owners and callout figures', () => {
  const holder = new Map([[1, true], [2, false]])
  it('a seat with nobody in it, or no owner at all, is unowned; a named person is owned', () => {
    expect(isUnowned({ ownerSeatId: 1, ownerPersonId: null }, holder)).toBe(false)
    expect(isUnowned({ ownerSeatId: 2, ownerPersonId: null }, holder)).toBe(true)
    expect(isUnowned({ ownerSeatId: null, ownerPersonId: null }, holder)).toBe(true)
    expect(isUnowned({ ownerSeatId: 2, ownerPersonId: 9 }, holder)).toBe(false)
    expect(isUnowned({ ownerSeatId: 99, ownerPersonId: null }, holder)).toBe(true)
  })
  it('counts zero, one and many, never counting done jobs', () => {
    const j = (status: 'todo' | 'blocked' | 'done', due: string | null, seat: number | null = 1) => ({ status, due, ownerSeatId: seat, ownerPersonId: null })
    expect(diaryStats([], holder, '2026-10-12')).toEqual({ overdue: 0, blocked: 0, unowned: 0 })
    expect(diaryStats([j('todo', '2026-10-01')], holder, '2026-10-12')).toEqual({ overdue: 1, blocked: 0, unowned: 0 })
    const many = [j('todo', '2026-10-01'), j('todo', '2026-09-01', 2), j('blocked', '2027-01-01'), j('done', '2020-01-01', null), j('blocked', '2026-01-01', null)]
    expect(diaryStats(many, holder, '2026-10-12')).toEqual({ overdue: 3, blocked: 2, unowned: 2 })
  })
  it('the wording pins what is left out and the singular form', () => {
    expect(officeCopy.diary.overdue(1)).toBe('1 club job is overdue (done jobs are not counted)')
    expect(officeCopy.diary.overdue(3)).toBe('3 club jobs are overdue (done jobs are not counted)')
    expect(officeCopy.diary.unowned(1)).toContain('a seat with nobody in it counts as no owner')
    expect(officeCopy.diary.stat(0, 0, 0)).toContain('done jobs are not counted')
    expect(officeCopy.diary.stat(2, 1, 4)).toBe('2 club jobs are overdue, 1 blocked, 4 without an owner (done jobs are not counted)')
    expect(officeCopy.diary.excludes).toContain('Done jobs are not counted')
  })
})

describe('dashboard lines', () => {
  const base = { latestRun: null, pending: { stories: 0, photos: 0 } }
  const opts = { isAdmin: false, adminRoute: '/admin', now: new Date('2026-10-12T00:00:00Z'), formatDate: () => '' }
  it('shows nothing at zero and puts overdue and blocked before the unowned information', () => {
    expect(notificationLines({ ...base, diary: { overdue: 0, blocked: 0, unowned: 0, overdueText: '', blockedText: '', unownedText: '' } } as never, opts).filter((l) => l.key.startsWith('jobs-'))).toEqual([])
    const lines = notificationLines({ ...base, diary: { overdue: 2, blocked: 1, unowned: 3, overdueText: 'o', blockedText: 'b', unownedText: 'u' } } as never, opts).filter((l) => l.key.startsWith('jobs-'))
    expect(lines.map((l) => l.key)).toEqual(['jobs-overdue', 'jobs-blocked', 'jobs-unowned'])
    expect(lines.map((l) => l.tone)).toEqual(['warn', 'warn', 'info'])
    expect(lines[0].href).toBe('/admin/office/diary?filter=overdue')
  })
})

describe('season dates', () => {
  it('southern club (season starts in July): offsets count from July', () => {
    expect(dueFromOffset('2026/27', 0, 1, SOUTH)).toBe('2026-07-01')
    expect(dueFromOffset('2026/27', 6, 15, SOUTH)).toBe('2027-01-15')
    expect(dueFromOffset('2026/27', 11, 1, SOUTH)).toBe('2027-06-01')
  })
  it('northern club (season starts in January, named by one year): offsets stay in the year', () => {
    expect(dueFromOffset('2027', 0, 1, NORTH)).toBe('2027-01-01')
    expect(dueFromOffset('2027', 11, 28, NORTH)).toBe('2027-12-28')
  })
  it('caps the day at the length of the month and refuses a name that is not a season', () => {
    expect(dueFromOffset('2027', 1, 31, NORTH)).toBe('2027-02-28')
    expect(dueFromOffset('2027/29', 0, 1, SOUTH)).toBeNull()
    expect(dueFromOffset('nonsense', 0, 1, SOUTH)).toBeNull()
  })
  it('names the next season and moves a date one year on', () => {
    expect(nextSeasonName('2026/27', SOUTH)).toBe('2027/28')
    expect(nextSeasonName('2099/00', SOUTH)).toBe('2100/01')
    expect(nextSeasonName('2027', NORTH)).toBe('2028')
    expect(oneYearOn('2028-02-29')).toBe('2029-02-28')
    expect(oneYearOn('2026-10-12')).toBe('2027-10-12')
  })
  it('every starter job lands inside its season in both calendars', () => {
    for (const [season, cfg] of [['2026/27', SOUTH], ['2027', NORTH]] as const) {
      const ops = planStarterJobs(season, STARTER_JOBS, [], cfg)
      expect(ops).toHaveLength(STARTER_JOBS.length)
      for (const op of ops) expect(op.due >= (cfg === SOUTH ? '2026-07-01' : '2027-01-01') && op.due <= (cfg === SOUTH ? '2027-06-30' : '2027-12-31'), `${op.title} ${op.due}`).toBe(true)
    }
  })
})

describe('starter idempotency', () => {
  it('a dozen standard jobs, each with a unique key', () => {
    expect(STARTER_JOBS.length).toBeGreaterThanOrEqual(12)
    expect(new Set(STARTER_JOBS.map((j) => j.key)).size).toBe(STARTER_JOBS.length)
  })
  it('adds only what is missing, matching by key so a renamed job is not duplicated', () => {
    const first = planStarterJobs('2026/27', STARTER_JOBS, [], SOUTH)
    const existing = first.map((o, i) => ({ season: '2026/27', sourceKey: o.sourceKey, title: i === 0 ? 'Renamed by the club' : o.title }))
    expect(planStarterJobs('2026/27', STARTER_JOBS, existing, SOUTH)).toEqual([])
  })
  it('another season gets its own copies, and a hand-typed job with the same title counts as present', () => {
    const existing = [{ season: '2026/27', sourceKey: null, title: 'open player REGISTRATION ' }]
    expect(planStarterJobs('2026/27', STARTER_JOBS, existing, SOUTH)).toHaveLength(STARTER_JOBS.length - 1)
    expect(planStarterJobs('2027/28', STARTER_JOBS, existing, SOUTH)).toHaveLength(STARTER_JOBS.length)
  })
  it('the starter plan adds only missing pillars and objectives', () => {
    const all = planStarterPlan(STARTER_PILLARS, [], [])
    expect(all.pillars).toHaveLength(5)
    expect(all.objectives.length).toBeGreaterThanOrEqual(10)
    expect(planStarterPlan(STARTER_PILLARS, all.pillars.map((p) => p.key), all.objectives.map((o) => o.key))).toEqual({ pillars: [], objectives: [] })
    const partial = planStarterPlan(STARTER_PILLARS, all.pillars.map((p) => p.key), all.objectives.slice(1).map((o) => o.key))
    expect(partial.pillars).toEqual([])
    expect(partial.objectives).toHaveLength(1)
  })
  it('every starter objective is marked as an example', () => {
    for (const p of STARTER_PILLARS) for (const o of p.objectives) expect(o.progressNote).toMatch(/example/i)
  })
})

describe('copy to the next season', () => {
  const job = (over: Partial<SourceJob>): SourceJob => ({ id: 1, season: '2026/27', sourceKey: null, title: 'Job', category: 'other', due: '2026-10-12', ownerSeatId: 3, ownerPersonId: null, budgetCents: 5000, repeatsYearly: true, notes: 'n', ...over })
  it('copies only repeating jobs, a year on, as to do with the owner and budget kept', () => {
    const plan = planCopyToNextSeason('2026/27', [job({ id: 1, title: 'A' }), job({ id: 2, title: 'B', repeatsYearly: false }), job({ id: 3, title: 'C', due: null })], [], SOUTH)!
    expect(plan.to).toBe('2027/28')
    expect(plan.ops).toHaveLength(1)
    expect(plan.ops[0]).toMatchObject({ title: 'A', due: '2027-10-12', ownerSeatId: 3, budgetCents: 5000, copiedFrom: 1 })
  })
  it('is idempotent: by key when there is one, else by title; also after the standard jobs were added', () => {
    const jobs = [job({ id: 1, title: 'A', sourceKey: 'k1' }), job({ id: 2, title: 'Mine' })]
    const once = planCopyToNextSeason('2026/27', jobs, jobs, SOUTH)!
    expect(once.ops).toHaveLength(2)
    const existing = [...jobs, ...once.ops.map((o) => ({ season: '2027/28', sourceKey: o.sourceKey, title: o.title === 'A' ? 'Renamed' : o.title }))]
    expect(planCopyToNextSeason('2026/27', jobs, existing, SOUTH)!.ops).toEqual([])
  })
  it('refuses a name that is not a season', () => {
    expect(planCopyToNextSeason('soon', [], [], SOUTH)).toBeNull()
  })
})

describe('objective progress and budget roll-up', () => {
  const j = (status: 'todo' | 'done' | 'blocked', budgetCents: number | null, actualCents: number | null) => ({ status, budgetCents, actualCents })
  it('no jobs gives zero progress and no warning', () => {
    expect(objectiveProgress(100_000, [])).toMatchObject({ total: 0, done: 0, percent: 0, budgetWarning: false, overspent: false })
  })
  it('counts done jobs and sums budget and spend', () => {
    const p = objectiveProgress(300_000, [j('done', 50_000, 40_000), j('done', 70_000, 70_000), j('todo', 10_000, null)])
    expect(p).toMatchObject({ total: 3, done: 2, percent: 67, jobBudgetCents: 130_000, actualCents: 110_000, budgetWarning: false, overspent: false })
  })
  it('warns when job budgets exceed the objective budget and flags overspend', () => {
    expect(objectiveProgress(100_000, [j('todo', 80_000, null), j('todo', 40_000, null)]).budgetWarning).toBe(true)
    expect(objectiveProgress(100_000, [j('done', 50_000, 120_000)]).overspent).toBe(true)
    expect(objectiveProgress(null, [j('todo', 80_000, 90_000)])).toMatchObject({ budgetWarning: false, overspent: false })
  })
  it('a job is over budget only when both figures exist and spend is higher', () => {
    expect(jobOverBudget({ budgetCents: 100, actualCents: 101 })).toBe(true)
    expect(jobOverBudget({ budgetCents: 100, actualCents: 100 })).toBe(false)
    expect(jobOverBudget({ budgetCents: null, actualCents: 500 })).toBe(false)
  })
})

describe('validation', () => {
  it('a blocked job needs a reason; others may have none; card-like numbers are refused', () => {
    expect(validateBlockedReason('blocked', '')).toEqual({ ok: false, code: 'reason' })
    expect(validateBlockedReason('blocked', '   ')).toEqual({ ok: false, code: 'reason' })
    expect(validateBlockedReason('blocked', 'Waiting on the council')).toEqual({ ok: true, value: 'Waiting on the council' })
    expect(validateBlockedReason('todo', '')).toEqual({ ok: true, value: '' })
    expect(validateBlockedReason('blocked', 'pay 4111 1111 1111 1111')).toEqual({ ok: false, code: 'reason' })
    expect(validateBlockedReason('blocked', 'x'.repeat(501))).toEqual({ ok: false, code: 'reason' })
  })
  it('amounts: empty is none, zero is allowed, negatives and fractions of a cent are refused', () => {
    expect(validateAmount('')).toEqual({ ok: true, value: null })
    expect(validateAmount('0')).toEqual({ ok: true, value: 0 })
    expect(validateAmount('120.50')).toEqual({ ok: true, value: 12050 })
    expect(validateAmount('-5')).toEqual({ ok: false, code: 'amount' })
    expect(validateAmount('1.234')).toEqual({ ok: false, code: 'amount' })
    expect(validateAmount('abc')).toEqual({ ok: false, code: 'amount' })
  })
  const good = { title: '  Renew insurance ', season: '2026/27', category: 'insurance', due: '2026-12-01', ownerSeat: '4', objective: '', budget: '250' }
  it('the quick-add job form returns clean values', () => {
    expect(validateJobInput(good, SOUTH)).toEqual({ ok: true, value: { title: 'Renew insurance', season: '2026/27', category: 'insurance', due: '2026-12-01', ownerSeatId: 4, objectiveId: null, budgetCents: 25000 } })
    expect(validateJobInput({ ...good, ownerSeat: '', due: '', category: '' }, SOUTH)).toMatchObject({ ok: true, value: { ownerSeatId: null, due: null, category: 'other' } })
  })
  it.each([
    [{ title: '' }, 'title'],
    [{ title: 'x'.repeat(161) }, 'title'],
    [{ season: '2026/28' }, 'season'],
    [{ season: 'whenever' }, 'season'],
    [{ category: 'secret' }, 'category'],
    [{ due: '2026-02-30' }, 'date'],
    [{ due: 'tomorrow' }, 'date'],
    [{ ownerSeat: 'abc' }, 'seat'],
    [{ ownerSeat: '-3' }, 'seat'],
    [{ objective: 'abc' }, 'objective'],
    [{ budget: '-1' }, 'amount'],
  ])('refuses %j with %s', (patch, code) => {
    expect(validateJobInput({ ...good, ...patch }, SOUTH)).toEqual({ ok: false, code })
  })
  it('objective input needs a title and a pillar id', () => {
    expect(validateObjectiveInput({ title: 'Grow', pillar: '2', targetDate: '2027-03-01', budget: '1000' })).toMatchObject({ ok: true, value: { pillarId: 2, budgetCents: 100000 } })
    expect(validateObjectiveInput({ title: '', pillar: '2' })).toEqual({ ok: false, code: 'title' })
    expect(validateObjectiveInput({ title: 'x', pillar: 'zero' })).toEqual({ ok: false, code: 'not-found' })
  })
})

describe('office settings for the diary', () => {
  it('fills neutral defaults and keeps valid values', () => {
    const d = resolveOfficeSettings(null)
    expect(d.diaryLeadDays).toBe(14)
    expect(d.diaryCategoryLabels.registration).toBe('Registration')
    const s = resolveOfficeSettings({ diaryLeadDays: 30, diaryCategoryLabels: { ground: 'Grounds and pitches', events: '  ' } })
    expect(s.diaryLeadDays).toBe(30)
    expect(s.diaryCategoryLabels.ground).toBe('Grounds and pitches')
    expect(s.diaryCategoryLabels.events).toBe('Events')
    expect(resolveOfficeSettings({ diaryLeadDays: 0 }).diaryLeadDays).toBe(14)
    expect(resolveOfficeSettings({ diaryLeadDays: 9999 }).diaryLeadDays).toBe(14)
  })
})
