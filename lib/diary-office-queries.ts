import 'server-only'
import type { Payload, PayloadRequest, TypedUser } from 'payload'
import { CLUB_LOCALE } from '@/config/site'
import { getPayloadClient } from '@/lib/payload/client'
import { peopleNames } from '@/lib/people-queries'
import { currentClubDate } from '@/lib/selection/club-date'
import { isStaffUser } from '@/payload/access'
import {
  DIARY_CATEGORIES,
  diaryStats as computeStats,
  isDiaryCategory,
  isJobFilter,
  isJobStatus,
  isObjectiveStatus,
  isUnowned,
  jobOverBudget,
  jobStanding,
  monthKey,
  objectiveProgress,
  nextSeasonName,
  parseDiaryId,
  planCopyToNextSeason,
  planStarterJobs,
  planStarterPlan,
  validateAmount,
  validateBlockedReason,
  validateJobInput,
  validateNote,
  validateObjectiveInput,
  validateTitle,
  type DiaryCategory,
  type DiaryError,
  type DiaryNotice,
  type DiaryStats,
  type JobFilter,
  type JobStanding,
  type JobStatus,
  type ObjectiveProgress,
  type ObjectiveStatus,
  type SourceJob,
} from './office/diary'
import { inTransaction, noon } from './office/fee-load'
import { formatMoney } from './office/money'
import { isSeasonName, seasonChoices } from './office/season'
import { getOfficeSettings } from './office/settings-server'
import { STARTER_JOBS } from './office/starter-diary'
import { STARTER_PILLARS } from './office/starter-plan'

/**
 * The data layer for the season diary and strategic plan (wave D spec section 7). Every function checks its caller itself (staff:
 * admin or editor; selectors get nothing). Reads and writes use the access override after that check, because the rules here are
 * "the committee", and the collection hooks (season, blocked reason, finished day) still run on every write. A plan action is a
 * diary job with an objective, so there is one overdue and blocked mechanism. Nothing here stores a derived value.
 */
type Doc = Record<string, unknown>
const staffOnly = (user: unknown): user is TypedUser => isStaffUser(user as never)
const idOf = (v: unknown): number | null => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'number' ? (v as { id: number }).id : null)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')

export type ActionResult = { ok: true; notice: DiaryNotice; n?: number } | { ok: false; code: DiaryError }
const fail = (code: DiaryError): ActionResult => ({ ok: false, code })
const done = (notice: DiaryNotice, n?: number): ActionResult => ({ ok: true, notice, ...(n !== undefined ? { n } : {}) })

const DAY = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
const MONTH = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: 'UTC', month: 'long', year: 'numeric' })
const dueLabel = (isoDay: string): string => DAY.format(new Date(`${isoDay}T12:00:00Z`))
const monthLabel = (key: string): string => (key === 'none' ? 'No due date' : MONTH.format(new Date(`${key}-01T12:00:00Z`)))

type SeatInfo = { id: number; title: string; holderId: number | null; holderName: string | null; holderUserId: number | null }

async function loadSeats(payload: Payload): Promise<Map<number, SeatInfo>> {
  const res = await payload.find({ collection: 'committee-seats', pagination: false, depth: 1, sort: 'sortOrder', overrideAccess: true })
  const out = new Map<number, SeatInfo>()
  for (const s of res.docs as unknown as Doc[]) {
    const holder = s.holder && typeof s.holder === 'object' ? (s.holder as Doc) : null
    out.set(s.id as number, { id: s.id as number, title: str(s.title), holderId: idOf(s.holder), holderName: holder ? str(holder.name) || null : null, holderUserId: idOf(s.holderUser) })
  }
  return out
}

const holderMap = (seats: Map<number, SeatInfo>): Map<number, boolean> => new Map([...seats.values()].map((s) => [s.id, s.holderId !== null]))

// ---- shapes -----------------------------------------------------------------------------------------------------------------

export type JobView = {
  id: number
  title: string
  season: string
  category: DiaryCategory
  categoryLabel: string
  due: string | null
  dueLabel: string | null
  status: JobStatus
  standing: JobStanding
  blockedReason: string
  ownerSeatId: number | null
  ownerLabel: string | null
  unowned: boolean
  budget: string | null
  actual: string | null
  overBudget: boolean
  objectiveId: number | null
  objectiveTitle: string | null
  repeatsYearly: boolean
  mine: boolean
  notes: string
}

async function loadJobs(payload: Payload, season: string | 'all'): Promise<Doc[]> {
  const res = await payload.find({
    collection: 'diary-jobs',
    ...(season === 'all' ? {} : { where: { season: { equals: season } } }),
    pagination: false,
    depth: 0,
    sort: 'due',
    overrideAccess: true,
  })
  return res.docs as unknown as Doc[]
}

function toView(d: Doc, ctx: { today: string; lead: number; seats: Map<number, SeatInfo>; hasHolder: Map<number, boolean>; labels: Record<DiaryCategory, string>; fmt: (c: number) => string; userId: number; people: Map<number, string>; objectives: Map<number, string> }): JobView {
  const status = isJobStatus(d.status) ? d.status : 'todo'
  const due = d.due ? day(d.due) : null
  const seatId = idOf(d.ownerSeat)
  const personId = idOf(d.ownerPerson)
  const seat = seatId !== null ? ctx.seats.get(seatId) : undefined
  const category = isDiaryCategory(d.category) ? d.category : 'other'
  const budget = numOrNull(d.budgetCents)
  const actual = numOrNull(d.actualCents)
  const objectiveId = idOf(d.objective)
  let ownerLabel: string | null = null
  if (seat) ownerLabel = seat.holderName ? `${seat.title} (${seat.holderName})` : `${seat.title} (vacant)`
  else if (personId !== null) ownerLabel = ctx.people.get(personId) ?? 'A named person'
  return {
    id: d.id as number,
    title: str(d.title),
    season: str(d.season),
    category,
    categoryLabel: ctx.labels[category],
    due,
    dueLabel: due ? dueLabel(due) : null,
    status,
    standing: jobStanding({ status, due }, ctx.today, ctx.lead),
    blockedReason: str(d.blockedReason),
    ownerSeatId: seatId,
    ownerLabel,
    unowned: isUnowned({ ownerSeatId: seatId, ownerPersonId: personId }, ctx.hasHolder),
    budget: budget !== null ? ctx.fmt(budget) : null,
    actual: actual !== null ? ctx.fmt(actual) : null,
    overBudget: jobOverBudget({ budgetCents: budget, actualCents: actual }),
    objectiveId,
    objectiveTitle: objectiveId !== null ? (ctx.objectives.get(objectiveId) ?? null) : null,
    repeatsYearly: Boolean(d.repeatsYearly),
    mine: seat !== undefined && seat.holderUserId !== null && seat.holderUserId === ctx.userId,
    notes: str(d.notes),
  }
}

async function viewContext(payload: Payload, user: TypedUser) {
  const settings = await getOfficeSettings(user)
  const seats = await loadSeats(payload)
  const peopleDocs = await peopleNames()
  const objectiveDocs = (await payload.find({ collection: 'plan-objectives', pagination: false, depth: 0, overrideAccess: true, select: { title: true } })).docs as unknown as Doc[]
  return {
    today: currentClubDate(),
    lead: settings.diaryLeadDays,
    seats,
    hasHolder: holderMap(seats),
    labels: settings.diaryCategoryLabels,
    fmt: (c: number) => formatMoney(c, settings),
    userId: user.id as number,
    people: new Map(peopleDocs.map((p) => [p.id, p.name])),
    objectives: new Map(objectiveDocs.map((o) => [o.id as number, str(o.title)])),
    settings,
  }
}

// ---- diary page -------------------------------------------------------------------------------------------------------------

export type DiaryPage = {
  season: string | 'all'
  seasons: string[]
  filter: JobFilter
  months: { key: string; label: string; jobs: JobView[] }[]
  counts: Record<'overdue' | 'blocked' | 'due-soon' | 'unowned' | 'mine', number>
  total: number
  seats: { id: number; title: string; holder: string | null }[]
  objectives: { id: number; title: string }[]
  categories: { key: DiaryCategory; label: string }[]
  canAddStandard: boolean
  hasRepeating: boolean
  nextSeason: string | null
  leadDays: number
  today: string
}

/** The diary for one season (or all seasons). With a chip chosen and no season, every season is shown, so the dashboard link finds every job it counted. */
export async function getDiaryPage(user: unknown, params: { season?: string; filter?: string }): Promise<DiaryPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const ctx = await viewContext(payload, user)
  const filter: JobFilter = isJobFilter(params.filter) ? params.filter : 'all'
  const current = seasonChoices(ctx.today, 1)[0]
  const wanted = params.season === 'all' ? 'all' : isSeasonName(params.season) ? params.season : filter === 'all' ? current : 'all'
  const docs = await loadJobs(payload, wanted)
  const views = docs.map((d) => toView(d, ctx))
  const open = views.filter((v) => v.status !== 'done')
  const counts = {
    overdue: open.filter((v) => v.standing === 'overdue').length,
    blocked: open.filter((v) => v.status === 'blocked').length,
    'due-soon': open.filter((v) => v.standing === 'due-soon').length,
    unowned: open.filter((v) => v.unowned).length,
    mine: open.filter((v) => v.mine).length,
  }
  const keep = (v: JobView): boolean =>
    filter === 'all' ||
    (filter === 'overdue' && v.status !== 'done' && v.standing === 'overdue') ||
    (filter === 'blocked' && v.status === 'blocked') ||
    (filter === 'due-soon' && v.standing === 'due-soon') ||
    (filter === 'unowned' && v.status !== 'done' && v.unowned) ||
    (filter === 'mine' && v.status !== 'done' && v.mine)
  const shown = views.filter(keep)
  const months = new Map<string, JobView[]>()
  for (const v of shown) {
    const k = monthKey(v.due)
    months.set(k, [...(months.get(k) ?? []), v])
  }
  const seasonSet = new Set<string>(seasonChoices(ctx.today, 4))
  const upcoming = nextSeasonName(current)
  if (upcoming) seasonSet.add(upcoming) // so next season can be planned before it holds a job
  const allSeasons = (await payload.find({ collection: 'diary-jobs', pagination: false, depth: 0, overrideAccess: true, select: { season: true } })).docs as unknown as Doc[]
  for (const d of allSeasons) if (isSeasonName(d.season)) seasonSet.add(d.season)
  const next = wanted === 'all' ? null : nextSeasonName(wanted)
  return {
    season: wanted,
    seasons: [...seasonSet].sort().reverse(),
    filter,
    months: [...months.entries()].sort(([a], [b]) => (a === 'none' ? 1 : b === 'none' ? -1 : a.localeCompare(b))).map(([key, jobs]) => ({ key, label: monthLabel(key), jobs })),
    counts,
    total: views.length,
    seats: [...ctx.seats.values()].map((s) => ({ id: s.id, title: s.title, holder: s.holderName })),
    objectives: [...ctx.objectives.entries()].map(([id, title]) => ({ id, title })),
    categories: DIARY_CATEGORIES.map((key) => ({ key, label: ctx.labels[key] })),
    canAddStandard: wanted !== 'all' && views.length === 0,
    hasRepeating: wanted !== 'all' && views.some((v) => v.repeatsYearly),
    nextSeason: next,
    leadDays: ctx.lead,
    today: ctx.today,
  }
}

function toSourceJob(d: Doc): SourceJob {
  return {
    id: d.id as number,
    season: str(d.season),
    sourceKey: str(d.sourceKey) || null,
    title: str(d.title),
    category: isDiaryCategory(d.category) ? d.category : 'other',
    due: d.due ? day(d.due) : null,
    ownerSeatId: idOf(d.ownerSeat),
    ownerPersonId: idOf(d.ownerPerson),
    budgetCents: numOrNull(d.budgetCents),
    repeatsYearly: Boolean(d.repeatsYearly),
    notes: str(d.notes),
  }
}

// ---- dashboard figures ------------------------------------------------------------------------------------------------------

/** Overdue, blocked and unowned jobs for the dashboard and the Club office landing page. Null for a non-committee caller or a failed read. */
export async function diaryFigures(user: unknown): Promise<DiaryStats | null> {
  if (!staffOnly(user)) return null
  try {
    const payload = await getPayloadClient()
    const jobs = (await payload.find({ collection: 'diary-jobs', where: { status: { not_equals: 'done' } }, pagination: false, depth: 0, overrideAccess: true, select: { status: true, due: true, ownerSeat: true, ownerPerson: true } })).docs as unknown as Doc[]
    const seats = await loadSeats(payload)
    return computeStats(
      jobs.map((d) => ({ status: isJobStatus(d.status) ? d.status : 'todo', due: d.due ? day(d.due) : null, ownerSeatId: idOf(d.ownerSeat), ownerPersonId: idOf(d.ownerPerson) })),
      holderMap(seats),
      currentClubDate(),
    )
  } catch (err) {
    console.warn('[office] diary summary unavailable:', (err as Error).message)
    return null
  }
}

// ---- diary writes -----------------------------------------------------------------------------------------------------------

const CTX = { disableRevalidate: true } as const

async function seatExists(payload: Payload, id: number | null): Promise<boolean> {
  if (id === null) return true
  return (await payload.count({ collection: 'committee-seats', where: { id: { equals: id } }, overrideAccess: true })).totalDocs > 0
}
async function objectiveExists(payload: Payload, id: number | null): Promise<boolean> {
  if (id === null) return true
  return (await payload.count({ collection: 'plan-objectives', where: { id: { equals: id } }, overrideAccess: true })).totalDocs > 0
}

export async function addJob(user: unknown, raw: { title: unknown; season: unknown; category: unknown; due: unknown; ownerSeat: unknown; objective?: unknown; budget?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateJobInput(raw)
  if (!v.ok) return fail(v.code)
  const payload = await getPayloadClient()
  if (!(await seatExists(payload, v.value.ownerSeatId))) return fail('seat')
  if (!(await objectiveExists(payload, v.value.objectiveId))) return fail('objective')
  try {
    await payload.create({
      collection: 'diary-jobs',
      data: {
        title: v.value.title,
        season: v.value.season,
        category: v.value.category,
        due: v.value.due ? noon(v.value.due) : null,
        ownerSeat: v.value.ownerSeatId,
        objective: v.value.objectiveId,
        budgetCents: v.value.budgetCents,
        status: 'todo',
      },
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    return done('job-added')
  } catch (err) {
    console.warn('[office] diary job not added:', (err as Error).message)
    return fail('save')
  }
}

/** Quick status change: to do, in progress, blocked (with a reason) or done. Done stamps the day; anything else clears it. */
export async function setJobStatus(user: unknown, raw: { id: unknown; status: unknown; reason?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseDiaryId(raw.id)
  if (id === null) return fail('not-found')
  if (!isJobStatus(raw.status)) return fail('status')
  const reason = validateBlockedReason(raw.status, raw.reason)
  if (!reason.ok) return fail(reason.code)
  const payload = await getPayloadClient()
  const existing = await payload.findByID({ collection: 'diary-jobs', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!existing) return fail('not-found')
  try {
    await payload.update({ collection: 'diary-jobs', id, data: { status: raw.status, blockedReason: raw.status === 'blocked' ? reason.value : '' }, overrideAccess: true, depth: 0, context: CTX })
    return done('job-saved')
  } catch (err) {
    console.warn('[office] diary job not updated:', (err as Error).message)
    return fail('save')
  }
}

/** Sets or clears the owning seat of a job. */
export async function setJobOwner(user: unknown, raw: { id: unknown; seat: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseDiaryId(raw.id)
  if (id === null) return fail('not-found')
  const seatId = raw.seat === '' || raw.seat === null || raw.seat === undefined ? null : parseDiaryId(raw.seat)
  if (raw.seat !== '' && raw.seat !== null && raw.seat !== undefined && seatId === null) return fail('seat')
  const payload = await getPayloadClient()
  if (!(await seatExists(payload, seatId))) return fail('seat')
  const existing = await payload.findByID({ collection: 'diary-jobs', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!existing) return fail('not-found')
  try {
    await payload.update({ collection: 'diary-jobs', id, data: { ownerSeat: seatId }, overrideAccess: true, depth: 0, context: CTX })
    return done('job-saved')
  } catch (err) {
    console.warn('[office] diary job owner not saved:', (err as Error).message)
    return fail('save')
  }
}

/** Adds the standard jobs the season lacks. Idempotent by key; never touches an existing job. */
export async function addStarterJobs(user: unknown, season: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (!isSeasonName(season)) return fail('season')
  const payload = await getPayloadClient()
  const existing = (await loadJobs(payload, season)).map((d) => ({ season: str(d.season), sourceKey: str(d.sourceKey) || null, title: str(d.title) }))
  const ops = planStarterJobs(season, STARTER_JOBS, existing)
  if (ops.length === 0) return done('starter-none', 0)
  try {
    await inTransaction(payload, async (req) => {
      for (const op of ops) {
        await payload.create({
          collection: 'diary-jobs',
          data: { title: op.title, season, category: op.category, due: noon(op.due), status: 'todo', repeatsYearly: op.repeatsYearly, notes: op.notes, sourceKey: op.sourceKey },
          overrideAccess: true,
          depth: 0,
          context: CTX,
          req: req as PayloadRequest,
        })
      }
    })
    return done('starter', ops.length)
  } catch (err) {
    // A second request that ran at the same moment hit the unique code on (season, source_key): the jobs are already there.
    const again = (await loadJobs(payload, season)).map((d) => ({ season: str(d.season), sourceKey: str(d.sourceKey) || null, title: str(d.title) }))
    if (planStarterJobs(season, STARTER_JOBS, again).length === 0) return done('starter-none', 0)
    console.warn('[office] standard jobs not added:', (err as Error).message)
    return fail('save')
  }
}

/** Copies the repeating jobs of a season to the next one (idempotent by key, else by title). Copies start as to do. */
export async function copyRepeatingJobs(user: unknown, season: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  if (!isSeasonName(season)) return fail('season')
  const payload = await getPayloadClient()
  const all = (await loadJobs(payload, 'all')).map(toSourceJob)
  const plan = planCopyToNextSeason(season, all, all)
  if (!plan) return fail('season')
  if (plan.ops.length === 0) return done('copied-none', 0)
  try {
    await inTransaction(payload, async (req) => {
      for (const op of plan.ops) {
        await payload.create({
          collection: 'diary-jobs',
          data: {
            title: op.title,
            season: plan.to,
            category: op.category,
            due: noon(op.due),
            ownerSeat: op.ownerSeatId,
            ownerPerson: op.ownerPersonId,
            budgetCents: op.budgetCents,
            status: 'todo',
            repeatsYearly: true,
            notes: op.notes,
            sourceKey: op.sourceKey,
          },
          overrideAccess: true,
          depth: 0,
          context: CTX,
          req: req as PayloadRequest,
        })
      }
    })
    return done('copied', plan.ops.length)
  } catch (err) {
    // A simultaneous copy already made them (unique code on season and source key): nothing left to do.
    const again = (await loadJobs(payload, 'all')).map(toSourceJob)
    if ((planCopyToNextSeason(season, again, again)?.ops.length ?? 1) === 0) return done('copied-none', 0)
    console.warn('[office] repeating jobs not copied:', (err as Error).message)
    return fail('save')
  }
}

// ---- plan page --------------------------------------------------------------------------------------------------------------

export type ObjectiveView = {
  id: number
  title: string
  status: ObjectiveStatus
  progressNote: string
  ownerLabel: string | null
  targetLabel: string | null
  progress: ObjectiveProgress
  progressText: string
  budgetText: string | null
  /** The budget as a plain number for the edit box, or empty. */
  budgetInput: string
  jobs: JobView[]
}
export type PillarView = { id: number; title: string; summary: string; objectives: ObjectiveView[] }
export type PlanPage = {
  pillars: PillarView[]
  unlinked: number
  seats: { id: number; title: string }[]
  categories: { key: DiaryCategory; label: string }[]
  season: string
  canAddStarter: boolean
}

export async function getPlanPage(user: unknown): Promise<PlanPage | null> {
  if (!staffOnly(user)) return null
  const payload = await getPayloadClient()
  const ctx = await viewContext(payload, user)
  const pillars = (await payload.find({ collection: 'plan-pillars', pagination: false, depth: 0, sort: 'sortOrder', overrideAccess: true })).docs as unknown as Doc[]
  const objectives = (await payload.find({ collection: 'plan-objectives', pagination: false, depth: 0, sort: 'sortOrder', overrideAccess: true })).docs as unknown as Doc[]
  const jobDocs = await loadJobs(payload, 'all')
  const jobs = jobDocs.map((d) => toView(d, ctx))
  const rawJobs = new Map(jobDocs.map((d) => [d.id as number, d]))
  const byObjective = new Map<number, JobView[]>()
  let unlinked = 0
  for (const j of jobs) {
    if (j.objectiveId === null) unlinked++
    else byObjective.set(j.objectiveId, [...(byObjective.get(j.objectiveId) ?? []), j])
  }
  const season = seasonChoices(ctx.today, 1)[0]
  const fmt = ctx.fmt
  const view = (o: Doc): ObjectiveView => {
    const linked = byObjective.get(o.id as number) ?? []
    const budget = numOrNull(o.budgetCents)
    const p = objectiveProgress(budget, linked.map((j) => {
      const raw = rawJobs.get(j.id)
      return { status: j.status, budgetCents: numOrNull(raw?.budgetCents), actualCents: numOrNull(raw?.actualCents) }
    }))
    const seat = idOf(o.ownerSeat) !== null ? ctx.seats.get(idOf(o.ownerSeat) as number) : undefined
    const target = o.targetDate ? day(o.targetDate) : null
    const spend = p.actualCents > 0 || p.jobBudgetCents > 0 ? `, ${fmt(p.actualCents)} spent of ${budget !== null ? fmt(budget) : fmt(p.jobBudgetCents)}` : ''
    return {
      id: o.id as number,
      title: str(o.title),
      status: isObjectiveStatus(o.status) ? o.status : 'not-started',
      progressNote: str(o.progressNote),
      ownerLabel: seat ? (seat.holderName ? `${seat.title} (${seat.holderName})` : `${seat.title} (vacant)`) : null,
      targetLabel: target ? dueLabel(target) : null,
      progress: p,
      progressText: p.total === 0 ? 'No jobs linked yet' : `${p.done} of ${p.total} ${p.total === 1 ? 'job' : 'jobs'} done${spend}`,
      budgetText: budget !== null ? fmt(budget) : null,
      budgetInput: budget !== null ? (budget / 100).toFixed(2) : '',
      jobs: linked,
    }
  }
  const views = objectives.map(view)
  return {
    pillars: pillars.map((p) => ({ id: p.id as number, title: str(p.title), summary: str(p.summary), objectives: views.filter((_, i) => idOf(objectives[i].pillar) === p.id) })),
    unlinked,
    seats: [...ctx.seats.values()].map((s) => ({ id: s.id, title: s.title })),
    categories: DIARY_CATEGORIES.map((key) => ({ key, label: ctx.labels[key] })),
    season,
    canAddStarter: pillars.length === 0,
  }
}

// ---- plan writes ------------------------------------------------------------------------------------------------------------

export async function addPillar(user: unknown, raw: { title: unknown; summary?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const title = validateTitle(raw.title, 120)
  if (!title.ok) return fail(title.code)
  const summary = validateNote(typeof raw.summary === 'string' ? raw.summary : '', 600)
  if (!summary.ok) return fail(summary.code)
  const payload = await getPayloadClient()
  try {
    const count = (await payload.count({ collection: 'plan-pillars', overrideAccess: true })).totalDocs
    await payload.create({ collection: 'plan-pillars', data: { title: title.value, summary: summary.value, sortOrder: (count + 1) * 10 }, overrideAccess: true, depth: 0, context: CTX })
    return done('pillar-added')
  } catch (err) {
    console.warn('[office] pillar not added:', (err as Error).message)
    return fail('save')
  }
}

export async function addObjective(user: unknown, raw: { title: unknown; pillar: unknown; targetDate?: unknown; budget?: unknown; ownerSeat?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const v = validateObjectiveInput(raw)
  if (!v.ok) return fail(v.code)
  const seatId = raw.ownerSeat === '' || raw.ownerSeat === null || raw.ownerSeat === undefined ? null : parseDiaryId(raw.ownerSeat)
  if (raw.ownerSeat !== '' && raw.ownerSeat !== null && raw.ownerSeat !== undefined && seatId === null) return fail('seat')
  const payload = await getPayloadClient()
  if ((await payload.count({ collection: 'plan-pillars', where: { id: { equals: v.value.pillarId } }, overrideAccess: true })).totalDocs === 0) return fail('not-found')
  if (!(await seatExists(payload, seatId))) return fail('seat')
  try {
    const count = (await payload.count({ collection: 'plan-objectives', where: { pillar: { equals: v.value.pillarId } }, overrideAccess: true })).totalDocs
    await payload.create({
      collection: 'plan-objectives',
      data: { pillar: v.value.pillarId, title: v.value.title, ownerSeat: seatId, targetDate: v.value.targetDate ? noon(v.value.targetDate) : null, budgetCents: v.value.budgetCents, status: 'not-started', sortOrder: (count + 1) * 10 },
      overrideAccess: true,
      depth: 0,
      context: CTX,
    })
    return done('objective-added')
  } catch (err) {
    console.warn('[office] objective not added:', (err as Error).message)
    return fail('save')
  }
}

export async function saveObjective(user: unknown, raw: { id: unknown; status: unknown; progressNote: unknown; budget?: unknown }): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const id = parseDiaryId(raw.id)
  if (id === null) return fail('not-found')
  if (!isObjectiveStatus(raw.status)) return fail('status')
  const note = validateNote(raw.progressNote, 1000)
  if (!note.ok) return fail(note.code)
  const budget = validateAmount(raw.budget)
  if (!budget.ok) return fail(budget.code)
  const payload = await getPayloadClient()
  const existing = await payload.findByID({ collection: 'plan-objectives', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!existing) return fail('not-found')
  try {
    await payload.update({ collection: 'plan-objectives', id, data: { status: raw.status, progressNote: note.value, budgetCents: budget.value }, overrideAccess: true, depth: 0, context: CTX })
    return done('objective-saved')
  } catch (err) {
    console.warn('[office] objective not saved:', (err as Error).message)
    return fail('save')
  }
}

/** Adds the starter pillars and objectives that are missing, by key. Nothing existing is changed. */
export async function addStarterPlan(user: unknown): Promise<ActionResult> {
  if (!staffOnly(user)) return fail('forbidden')
  const payload = await getPayloadClient()
  const pillars = (await payload.find({ collection: 'plan-pillars', pagination: false, depth: 0, overrideAccess: true, select: { sourceKey: true } })).docs as unknown as Doc[]
  const objectives = (await payload.find({ collection: 'plan-objectives', pagination: false, depth: 0, overrideAccess: true, select: { sourceKey: true } })).docs as unknown as Doc[]
  const ops = planStarterPlan(STARTER_PILLARS, pillars.map((p) => str(p.sourceKey)).filter(Boolean), objectives.map((o) => str(o.sourceKey)).filter(Boolean))
  if (ops.pillars.length === 0 && ops.objectives.length === 0) return done('plan-starter-none', 0)
  try {
    await inTransaction(payload, async (req) => {
      const r = req as PayloadRequest
      const idByKey = new Map<string, number>()
      for (const p of pillars) if (str(p.sourceKey)) idByKey.set(str(p.sourceKey), p.id as number)
      for (const p of ops.pillars) {
        const row = await payload.create({ collection: 'plan-pillars', data: { title: p.title, summary: p.summary, sortOrder: p.sortOrder, sourceKey: p.key }, overrideAccess: true, depth: 0, context: CTX, req: r })
        idByKey.set(p.key, row.id as number)
      }
      for (const o of ops.objectives) {
        const pillar = idByKey.get(o.pillarKey)
        if (pillar === undefined) continue
        await payload.create({ collection: 'plan-objectives', data: { pillar, title: o.title, progressNote: o.progressNote, sortOrder: o.sortOrder, status: 'not-started', sourceKey: o.key }, overrideAccess: true, depth: 0, context: CTX, req: r })
      }
    })
    return done('plan-starter', ops.pillars.length + ops.objectives.length)
  } catch (err) {
    // A simultaneous request already added them (unique source codes): nothing left to do.
    const pAgain = (await payload.find({ collection: 'plan-pillars', pagination: false, depth: 0, overrideAccess: true, select: { sourceKey: true } })).docs as unknown as Doc[]
    const oAgain = (await payload.find({ collection: 'plan-objectives', pagination: false, depth: 0, overrideAccess: true, select: { sourceKey: true } })).docs as unknown as Doc[]
    const left = planStarterPlan(STARTER_PILLARS, pAgain.map((p) => str(p.sourceKey)).filter(Boolean), oAgain.map((o) => str(o.sourceKey)).filter(Boolean))
    if (left.pillars.length === 0 && left.objectives.length === 0) return done('plan-starter-none', 0)
    console.warn('[office] starter plan not added:', (err as Error).message)
    return fail('save')
  }
}
