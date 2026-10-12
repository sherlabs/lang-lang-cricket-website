import { looksLikeCardNumber } from './card'
import { parseRate } from './money'
import { isSeasonName, seasonRange, seasonStartYearOfName, seasonNameForYear } from './season'

/**
 * Season diary and strategic plan rules (wave D spec section 7). Everything here is pure: the data layer
 * (`lib/diary-office-queries.ts`) loads rows and calls these, so the rules are unit tested without a database. "Today" is always
 * passed in as a club-time date string (`currentClubDate()`), never read from the server's own clock or zone in here.
 */
export const DIARY_CATEGORIES = ['registration', 'governance', 'insurance', 'permits', 'finance', 'ground', 'events', 'other'] as const
export type DiaryCategory = (typeof DIARY_CATEGORIES)[number]
export const JOB_STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]
export const OBJECTIVE_STATUSES = ['not-started', 'on-track', 'at-risk', 'done', 'dropped'] as const
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number]
export const JOB_FILTERS = ['all', 'overdue', 'blocked', 'due-soon', 'unowned', 'mine'] as const
export type JobFilter = (typeof JOB_FILTERS)[number]

/** Neutral category names. A club renames them in Club office settings; the keys never change. */
export const DEFAULT_CATEGORY_LABELS: Record<DiaryCategory, string> = {
  registration: 'Registration',
  governance: 'Governance',
  insurance: 'Insurance',
  permits: 'Permits',
  finance: 'Finance',
  ground: 'Ground',
  events: 'Events',
  other: 'Other',
}
export const DEFAULT_DIARY_LEAD_DAYS = 14
export const MAX_DIARY_LEAD_DAYS = 120

const oneOf = <T extends string>(list: readonly T[]) => (v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v)
export const isDiaryCategory = oneOf(DIARY_CATEGORIES)
export const isJobStatus = oneOf(JOB_STATUSES)
export const isObjectiveStatus = oneOf(OBJECTIVE_STATUSES)
export const isJobFilter = oneOf(JOB_FILTERS)

const posId = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,10}$/.test(v.trim()) ? Number(v.trim()) : NaN
  return Number.isInteger(n) && n > 0 && n < 2_000_000_000 ? n : null
}
export const parseDiaryId = posId
export const isIsoDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v

// ---- standing ---------------------------------------------------------------------------------------------------------------

export type JobStanding = 'done' | 'overdue' | 'blocked' | 'due-soon' | 'open'
export type JobLike = { status: JobStatus; due: string | null }

const addDays = (isoDay: string, n: number): string => {
  const d = new Date(`${isoDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Derived on read, never stored. Overdue wins over blocked so a late blocked job still counts as late. A job is due soon when it is
 * not done and falls due within `leadDays` days (today counts as soon, not as overdue). `today` is a club-time date.
 */
export function jobStanding(job: JobLike, today: string, leadDays = DEFAULT_DIARY_LEAD_DAYS): JobStanding {
  if (job.status === 'done') return 'done'
  const due = job.due ? job.due.slice(0, 10) : null
  if (due && due < today) return 'overdue'
  if (job.status === 'blocked') return 'blocked'
  if (due && due <= addDays(today, Math.max(0, leadDays))) return 'due-soon'
  return 'open'
}

/** A job has an owner when it names a seat that has a holder, or a person. */
export function isUnowned(job: { ownerSeatId: number | null; ownerPersonId: number | null }, seatHasHolder: ReadonlyMap<number, boolean>): boolean {
  if (job.ownerPersonId !== null) return false
  return job.ownerSeatId === null || seatHasHolder.get(job.ownerSeatId) !== true
}

export type DiaryStatJob = JobLike & { ownerSeatId: number | null; ownerPersonId: number | null }
export type DiaryStats = { overdue: number; blocked: number; unowned: number }

/** The three callout figures. Done jobs are never counted. A late blocked job counts as both overdue and blocked (each line is true on its own). */
export function diaryStats(jobs: readonly DiaryStatJob[], seatHasHolder: ReadonlyMap<number, boolean>, today: string): DiaryStats {
  let overdue = 0
  let blocked = 0
  let unowned = 0
  for (const j of jobs) {
    if (j.status === 'done') continue
    if (jobStanding(j, today) === 'overdue') overdue++
    if (j.status === 'blocked') blocked++
    if (isUnowned(j, seatHasHolder)) unowned++
  }
  return { overdue, blocked, unowned }
}

// ---- plan roll-ups ----------------------------------------------------------------------------------------------------------

export type RollupJob = { status: JobStatus; budgetCents: number | null; actualCents: number | null }
export type ObjectiveProgress = {
  total: number
  done: number
  /** Whole percent of linked jobs that are done; 0 when there are none. */
  percent: number
  jobBudgetCents: number
  actualCents: number
  /** Objective budget, if one was set. */
  budgetCents: number | null
  /** Linked job budgets exceed the objective budget (a warning, never a block). */
  budgetWarning: boolean
  /** Spend so far exceeds the objective budget. */
  overspent: boolean
}

/** Progress of one objective from its linked diary jobs (done jobs over all jobs) and the spend versus budget roll-up. */
export function objectiveProgress(objectiveBudgetCents: number | null, jobs: readonly RollupJob[]): ObjectiveProgress {
  const total = jobs.length
  const done = jobs.filter((j) => j.status === 'done').length
  const jobBudgetCents = jobs.reduce((s, j) => s + (j.budgetCents ?? 0), 0)
  const actualCents = jobs.reduce((s, j) => s + (j.actualCents ?? 0), 0)
  return {
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    jobBudgetCents,
    actualCents,
    budgetCents: objectiveBudgetCents,
    budgetWarning: objectiveBudgetCents !== null && jobBudgetCents > objectiveBudgetCents,
    overspent: objectiveBudgetCents !== null && actualCents > objectiveBudgetCents,
  }
}

/** A job is over its own budget when the actual spend is above a set budget. */
export const jobOverBudget = (j: { budgetCents: number | null; actualCents: number | null }): boolean => j.budgetCents !== null && j.actualCents !== null && j.actualCents > j.budgetCents

// ---- season dates -----------------------------------------------------------------------------------------------------------

type Cfg = { startMonth: number; format: 'split' | 'single' }
const lastDayOfMonth = (year: number, month1: number): number => new Date(Date.UTC(year, month1, 0)).getUTCDate()

/**
 * The due date for a starter job: `monthOffset` months after the season's first month (0 is the start month), on `day` of that month
 * (capped at the month's length). Works for any start month, so a northern club with `startMonth` 1 and a southern one with 7 both get
 * their own calendar. Returns null for a name that is not a season.
 */
export function dueFromOffset(season: string, monthOffset: number, day: number, cfg?: Cfg): string | null {
  const startYear = seasonStartYearOfName(season, cfg)
  const range = seasonRange(season, cfg)
  if (startYear === null || !range || !Number.isInteger(monthOffset) || monthOffset < 0 || monthOffset > 23) return null
  const startMonth = Number(range.from.slice(5, 7))
  const m0 = startMonth - 1 + monthOffset
  const year = startYear + Math.floor(m0 / 12)
  const month1 = (m0 % 12) + 1
  const d = Math.min(Math.max(1, Math.floor(day)), lastDayOfMonth(year, month1))
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** The season after `season` (same naming rules), or null for a name that is not a season. */
export function nextSeasonName(season: string, cfg?: Cfg): string | null {
  const y = seasonStartYearOfName(season, cfg)
  return y === null ? null : seasonNameForYear(y + 1, cfg)
}

/** A date moved one year on (29 February becomes 28 February in a year without one). */
export function oneYearOn(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number)
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(y + 1, m))).padStart(2, '0')}`
}

/** Month heading key and label for grouping jobs on the diary page. */
export function monthKey(isoDay: string | null): string {
  return isoDay ? isoDay.slice(0, 7) : 'none'
}

// ---- starter and copy idempotency -------------------------------------------------------------------------------------------

export const normaliseTitle = (title: string): string => title.trim().toLowerCase().replace(/\s+/g, ' ')

export type StarterJob = { key: string; title: string; category: DiaryCategory; monthOffset: number; day: number; repeatsYearly: boolean; notes?: string }
export type ExistingJob = { season: string; sourceKey: string | null; title: string }
export type NewJobOp = { sourceKey: string; title: string; category: DiaryCategory; due: string; repeatsYearly: boolean; notes: string }

/**
 * Which standard jobs a season still lacks. A job counts as present if a job of that season already has its `sourceKey`, so editing
 * the title never causes a duplicate and re-running never overwrites an edit. A hand-made job with the same title is also treated as
 * present, so adding the standard jobs after typing some of them does not double up.
 */
export function planStarterJobs(season: string, starters: readonly StarterJob[], existing: readonly ExistingJob[], cfg?: Cfg): NewJobOp[] {
  const inSeason = existing.filter((e) => e.season === season)
  const keys = new Set(inSeason.map((e) => e.sourceKey).filter((k): k is string => Boolean(k)))
  const titles = new Set(inSeason.map((e) => normaliseTitle(e.title)))
  const ops: NewJobOp[] = []
  for (const s of starters) {
    if (keys.has(s.key) || titles.has(normaliseTitle(s.title))) continue
    const due = dueFromOffset(season, s.monthOffset, s.day, cfg)
    if (!due) continue
    ops.push({ sourceKey: s.key, title: s.title, category: s.category, due, repeatsYearly: s.repeatsYearly, notes: s.notes ?? '' })
  }
  return ops
}

export type SourceJob = { id: number; season: string; sourceKey: string | null; title: string; category: DiaryCategory; due: string | null; ownerSeatId: number | null; ownerPersonId: number | null; budgetCents: number | null; repeatsYearly: boolean; notes: string }
export type CopyJobOp = Omit<SourceJob, 'id' | 'season' | 'due'> & { due: string; copiedFrom: number }

/** The identity of a job across seasons: its starter key, else its normalised title. */
export const jobIdentity = (j: { sourceKey: string | null; title: string }): string => (j.sourceKey ? `k:${j.sourceKey}` : `t:${normaliseTitle(j.title)}`)

/**
 * Repeating jobs of `from` that the next season does not have yet. Identity is the starter key (else the title), so running it twice,
 * or after the standard jobs were added, never duplicates a job. Copies start as to do; the due date moves one year on; the owner,
 * budget and notes carry over (actual spend does not).
 */
export function planCopyToNextSeason(from: string, jobs: readonly SourceJob[], existing: readonly ExistingJob[], cfg?: Cfg): { to: string; ops: CopyJobOp[] } | null {
  const to = nextSeasonName(from, cfg)
  if (!to) return null
  const have = new Set(existing.filter((e) => e.season === to).map(jobIdentity))
  const ops: CopyJobOp[] = []
  for (const j of jobs) {
    if (j.season !== from || !j.repeatsYearly || !j.due) continue
    const id = jobIdentity(j)
    if (have.has(id)) continue
    have.add(id)
    const { id: copiedFrom, season: _season, due, ...rest } = j
    void _season
    ops.push({ ...rest, due: oneYearOn(due), copiedFrom })
  }
  return { to, ops }
}

export type StarterObjective = { key: string; title: string; progressNote: string }
export type StarterPillar = { key: string; title: string; summary: string; objectives: StarterObjective[] }
export type StarterPlanOps = { pillars: { key: string; title: string; summary: string; sortOrder: number }[]; objectives: { pillarKey: string; key: string; title: string; progressNote: string; sortOrder: number }[] }

/** Which pillars and objectives of the starter plan are missing, by `sourceKey`. Nothing existing is ever changed. */
export function planStarterPlan(starters: readonly StarterPillar[], existingPillarKeys: readonly string[], existingObjectiveKeys: readonly string[]): StarterPlanOps {
  const pk = new Set(existingPillarKeys)
  const ok = new Set(existingObjectiveKeys)
  const out: StarterPlanOps = { pillars: [], objectives: [] }
  starters.forEach((p, i) => {
    if (!pk.has(p.key)) out.pillars.push({ key: p.key, title: p.title, summary: p.summary, sortOrder: (i + 1) * 10 })
    p.objectives.forEach((o, j) => {
      if (!ok.has(o.key)) out.objectives.push({ pillarKey: p.key, key: o.key, title: o.title, progressNote: o.progressNote, sortOrder: (j + 1) * 10 })
    })
  })
  return out
}

// ---- input validation -------------------------------------------------------------------------------------------------------

export type DiaryError = 'forbidden' | 'not-found' | 'title' | 'date' | 'season' | 'category' | 'status' | 'reason' | 'amount' | 'text' | 'seat' | 'objective' | 'save'
export type Check<T> = { ok: true; value: T } | { ok: false; code: DiaryError }

const trimmed = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const safeText = (v: unknown, max: number): string | null => {
  const t = trimmed(v, max)
  return t && !looksLikeCardNumber(t) ? t : null
}

export function validateTitle(v: unknown, max = 160): Check<string> {
  const t = safeText(v, max)
  return t ? { ok: true, value: t } : { ok: false, code: 'title' }
}

export function validateNote(v: unknown, max = 2000): Check<string> {
  if (typeof v !== 'string') return { ok: false, code: 'text' }
  const t = v.trim()
  return t.length > max || looksLikeCardNumber(t) ? { ok: false, code: 'text' } : { ok: true, value: t }
}

/** A blocked job must say why. Also used by the collection hook so the native form cannot skip it. */
export function validateBlockedReason(status: unknown, reason: unknown): Check<string> {
  const t = typeof reason === 'string' ? reason.trim() : ''
  if (status === 'blocked' && !t) return { ok: false, code: 'reason' }
  if (t.length > 500 || looksLikeCardNumber(t)) return { ok: false, code: 'reason' }
  return { ok: true, value: t }
}

/** An optional amount in cents: empty is null, zero is allowed, negatives and more than two decimals are refused. */
export function validateAmount(v: unknown): Check<number | null> {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return { ok: true, value: null }
  const cents = parseRate(v)
  return cents === null ? { ok: false, code: 'amount' } : { ok: true, value: cents }
}

export type JobInput = {
  title: string
  season: string
  category: DiaryCategory
  due: string | null
  ownerSeatId: number | null
  objectiveId: number | null
  budgetCents: number | null
}

/** The quick-add job form. The season must be a real season name and the due date a real day. */
export function validateJobInput(raw: { title: unknown; season: unknown; category: unknown; due: unknown; ownerSeat: unknown; objective?: unknown; budget?: unknown }, cfg?: Cfg): Check<JobInput> {
  const title = validateTitle(raw.title)
  if (!title.ok) return title
  if (!isSeasonName(raw.season, cfg)) return { ok: false, code: 'season' }
  const category = raw.category === '' || raw.category === undefined || raw.category === null ? 'other' : raw.category
  if (!isDiaryCategory(category)) return { ok: false, code: 'category' }
  const dueText = typeof raw.due === 'string' ? raw.due.trim() : ''
  if (dueText && !isIsoDay(dueText)) return { ok: false, code: 'date' }
  const seatText = raw.ownerSeat === '' || raw.ownerSeat === null || raw.ownerSeat === undefined ? null : posId(raw.ownerSeat)
  if (raw.ownerSeat !== '' && raw.ownerSeat !== null && raw.ownerSeat !== undefined && seatText === null) return { ok: false, code: 'seat' }
  const objText = raw.objective === '' || raw.objective === null || raw.objective === undefined ? null : posId(raw.objective)
  if (raw.objective !== '' && raw.objective !== null && raw.objective !== undefined && objText === null) return { ok: false, code: 'objective' }
  const budget = validateAmount(raw.budget)
  if (!budget.ok) return budget
  return { ok: true, value: { title: title.value, season: raw.season, category, due: dueText || null, ownerSeatId: seatText, objectiveId: objText, budgetCents: budget.value } }
}

export function validateObjectiveInput(raw: { title: unknown; pillar: unknown; targetDate?: unknown; budget?: unknown }): Check<{ title: string; pillarId: number; targetDate: string | null; budgetCents: number | null }> {
  const title = validateTitle(raw.title)
  if (!title.ok) return title
  const pillarId = posId(raw.pillar)
  if (pillarId === null) return { ok: false, code: 'not-found' }
  const t = typeof raw.targetDate === 'string' ? raw.targetDate.trim() : ''
  if (t && !isIsoDay(t)) return { ok: false, code: 'date' }
  const budget = validateAmount(raw.budget)
  if (!budget.ok) return budget
  return { ok: true, value: { title: title.value, pillarId, targetDate: t || null, budgetCents: budget.value } }
}

// ---- wording ----------------------------------------------------------------------------------------------------------------

export const DIARY_ERROR_TEXT: Record<DiaryError, string> = {
  forbidden: 'You are not allowed to do that.',
  'not-found': 'That could not be found. It may have been removed.',
  title: 'Please give it a title (not too long).',
  date: 'Please pick a valid date.',
  season: 'Please pick a season from the list.',
  category: 'Please pick a category from the list.',
  status: 'Please pick a status from the list.',
  reason: 'A blocked job needs a short reason (not too long, and no card numbers).',
  amount: 'Amounts are plain numbers with at most two decimals, for example 120 or 120.50.',
  text: 'That text is too long or does not look right.',
  seat: 'Please pick a committee seat from the list.',
  objective: 'Please pick an objective from the list.',
  save: 'That could not be saved. Check the details and try again.',
}

export const DIARY_NOTICE_TEXT = {
  'job-added': 'Job added.',
  'job-saved': 'Job updated.',
  starter: 'Standard jobs added.',
  'starter-none': 'Nothing to add: the standard jobs are already there.',
  copied: 'Repeating jobs copied to the next season.',
  'copied-none': 'Nothing to copy: the next season already has them, or no job repeats.',
  'pillar-added': 'Pillar added.',
  'objective-added': 'Objective added.',
  'objective-saved': 'Objective updated.',
  'plan-starter': 'Starter plan added. Edit it to suit your club.',
  'plan-starter-none': 'Nothing to add: the starter plan is already there.',
} as const
export type DiaryNotice = keyof typeof DIARY_NOTICE_TEXT
export const isDiaryNotice = (v: unknown): v is DiaryNotice => typeof v === 'string' && v in DIARY_NOTICE_TEXT
export const isDiaryError = (v: unknown): v is DiaryError => typeof v === 'string' && v in DIARY_ERROR_TEXT
