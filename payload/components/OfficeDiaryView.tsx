import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { DIARY_ERROR_TEXT, DIARY_NOTICE_TEXT, isDiaryError, isDiaryNotice, type JobFilter, type JobStanding } from '@/lib/office/diary'
import { getDiaryPage, type JobView } from '@/lib/diary-office-queries'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireStaff } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STANDING: Record<JobStanding, string> = { done: 'Done', overdue: 'Overdue', blocked: 'Blocked', 'due-soon': 'Due soon', open: '' }
const STATUS_TEXT = { todo: 'To do', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' } as const
/** The standing (overdue, due soon) and the status in words, so "Overdue, in progress" keeps both. */
function statusText(j: JobView): string {
  const standing = STANDING[j.standing]
  if (!standing) return STATUS_TEXT[j.status]
  return standing === STATUS_TEXT[j.status] ? standing : `${standing}, ${STATUS_TEXT[j.status].toLowerCase()}`
}

/**
 * `/admin/office/diary` (committee): the season's annual jobs by month, with overdue, blocked, due-soon, unowned and "mine" chips.
 * Status is always written in words, never by colour alone. Every change is a plain form posted to the diary route, so it works
 * without scripts.
 */
export async function OfficeDiaryView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/office/diary')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/diary`
  const sp = view.searchParams ?? {}
  const page = await getDiaryPage(req.user, { season: first(sp.season), filter: first(sp.filter) })
  if (!page) return null
  const base = `${admin}/office/diary`
  const notice = first(sp.notice)
  const error = first(sp.error)
  const season = page.season
  const chipHref = (filter: JobFilter): string => `${base}?season=${encodeURIComponent(season)}${filter === 'all' ? '' : `&filter=${filter}`}`
  const hidden = (
    <>
      <input type="hidden" name="return" value="/office/diary" />
      <input type="hidden" name="season" value={season} />
      {page.filter !== 'all' ? <input type="hidden" name="filter" value={page.filter} /> : null}
    </>
  )
  const chips: { key: JobFilter; label: string; count?: number }[] = [
    { key: 'all', label: 'Everything' },
    { key: 'overdue', label: 'Overdue', count: page.counts.overdue },
    { key: 'blocked', label: 'Blocked', count: page.counts.blocked },
    { key: 'due-soon', label: 'Due soon', count: page.counts['due-soon'] },
    { key: 'unowned', label: 'No owner', count: page.counts.unowned },
    { key: 'mine', label: 'Mine', count: page.counts.mine },
  ]
  const addSeason = season === 'all' ? (page.seasons[0] ?? '') : season

  const job = (j: JobView) => (
    <li key={j.id} className="diary-job">
      <p className="diary-job__title">
        <span className="office-badge">{statusText(j)}</span>{' '}
        <strong>{j.title}</strong>
        {j.overBudget ? <span className="office-badge">{officeCopy.diary.overBudget}</span> : null}
      </p>
      <p className="club-muted">
        {j.categoryLabel}
        {j.dueLabel ? `. Due ${j.dueLabel}` : '. No due date'}
        {season === 'all' ? ` (${j.season})` : ''}
        {j.ownerLabel ? `. ${j.ownerLabel}` : '. No owner'}
        {j.budget ? `. Budget ${j.budget}${j.actual ? `, spent ${j.actual}` : ''}` : j.actual ? `. Spent ${j.actual}` : ''}
        {j.objectiveTitle ? `. Plan: ${j.objectiveTitle}` : ''}
        {j.repeatsYearly ? '. Repeats every season' : ''}
      </p>
      {j.status === 'blocked' && j.blockedReason ? <p>Blocked because: {j.blockedReason}</p> : null}
      <form method="post" action={`${api}/job-status`} className="office-inline">
        {hidden}
        <input type="hidden" name="id" value={j.id} />
        {j.status !== 'done' ? <button type="submit" name="status" value="done" aria-label={`Done: ${j.title}`} className="btn btn--style-primary btn--size-medium">Done</button> : null}
        {j.status === 'todo' || j.status === 'blocked' ? <button type="submit" name="status" value="in-progress" aria-label={`Start: ${j.title}`} className="btn btn--style-secondary btn--size-medium">Start</button> : null}
        {j.status === 'blocked' || j.status === 'in-progress' ? <button type="submit" name="status" value="todo" aria-label={`Move back to To do: ${j.title}`} className="btn btn--style-secondary btn--size-medium">Move back to To do</button> : null}
        {j.status === 'done' ? <button type="submit" name="status" value="todo" aria-label={`Reopen: ${j.title}`} className="btn btn--style-secondary btn--size-medium">Reopen</button> : null}
      </form>
      {j.status !== 'done' && j.status !== 'blocked' ? (
        <form method="post" action={`${api}/job-status`} className="office-inline">
          {hidden}
          <input type="hidden" name="id" value={j.id} />
          <input type="hidden" name="status" value="blocked" />
          <label>
            <span className="club-muted">Stuck? Say why</span>
            <input name="reason" required maxLength={500} aria-label={`Why is it blocked: ${j.title}`} />
          </label>
          <button type="submit" aria-label={`Mark blocked: ${j.title}`} className="btn btn--style-secondary btn--size-medium">Mark blocked</button>
        </form>
      ) : null}
      {j.unowned && j.status !== 'done' ? (
        <form method="post" action={`${api}/job-owner`} className="office-inline">
          {hidden}
          <input type="hidden" name="id" value={j.id} />
          <label>
            <span className="club-muted">Who owns it?</span>
            <select name="ownerSeat" defaultValue="" aria-label={`Owner of ${j.title}`}>
              <option value="">Pick a seat</option>
              {page.seats.map((s) => (
                <option key={s.id} value={s.id}>{s.title}{s.holder ? ` (${s.holder})` : ' (vacant)'}</option>
              ))}
            </select>
          </label>
          <button type="submit" aria-label={`Set owner: ${j.title}`} className="btn btn--style-secondary btn--size-medium">Set owner</button>
        </form>
      ) : null}
      <p><a href={`${admin}/collections/diary-jobs/${j.id}`}>Edit all details</a></p>
    </li>
  )

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Diary & plan' }]} />
      <h1 className="club-page__title">Season diary</h1>
      <p className="club-page__lead">The jobs the club does every year, who owns them and when they are due. {officeCopy.diary.excludes}</p>

      <div role="status" aria-live="polite">
        {isDiaryNotice(notice) ? <p className="office-flash office-flash--ok">{DIARY_NOTICE_TEXT[notice]}{first(sp.n) ? ` (${first(sp.n)})` : ''}</p> : null}
        {isDiaryError(error) ? <p className="office-flash office-flash--error">{DIARY_ERROR_TEXT[error]}</p> : null}
      </div>

      <form method="get" action={base} className="office-filters" role="search">
        <label>
          Season
          <select name="season" defaultValue={season}>
            <option value="all">All seasons</option>
            {page.seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        {page.filter !== 'all' ? <input type="hidden" name="filter" value={page.filter} /> : null}
        <button type="submit" className="btn btn--style-primary btn--size-medium">Show season</button>
      </form>

      <nav aria-label="Filter the jobs" className="office-chips">
        {chips.map((c) => (
          <a key={c.key} href={chipHref(c.key)} className={`office-chip${page.filter === c.key ? ' office-chip--on' : ''}`} aria-current={page.filter === c.key ? 'true' : undefined}>
            {c.label}
            {c.count !== undefined ? ` (${c.count})` : ''}
          </a>
        ))}
      </nav>
      <p className="club-muted">Jobs count as due soon when they fall due within {page.leadDays} days.</p>

      <div className="office-actions">
        <a className="btn btn--style-secondary btn--size-medium" href={`${admin}/office/plan`}>Strategic plan</a>
        {page.canAddStandard ? (
          <form method="post" action={`${api}/starter-jobs`} className="office-inline">
            {hidden}
            <button type="submit" className="btn btn--style-primary btn--size-medium">Add the standard jobs for {season}</button>
          </form>
        ) : null}
        {page.hasRepeating && page.nextSeason ? (
          <form method="post" action={`${api}/copy-jobs`} className="office-inline">
            {hidden}
            <button type="submit" className="btn btn--style-secondary btn--size-medium">Copy repeating jobs to {page.nextSeason}</button>
          </form>
        ) : null}
      </div>

      <details className="office-quickadd">
        <summary>Add a job</summary>
        <form method="post" action={`${api}/job-add`} className="office-form">
          {hidden}
          <label>
            Job
            <input name="title" required maxLength={160} />
          </label>
          <label>
            Season
            <select name="jobSeason" defaultValue={addSeason}>
              {page.seasons.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Due
            <input name="due" type="date" />
          </label>
          <label>
            Owned by
            <select name="ownerSeat" defaultValue="">
              <option value="">Nobody yet</option>
              {page.seats.map((s) => (
                <option key={s.id} value={s.id}>{s.title}{s.holder ? ` (${s.holder})` : ' (vacant)'}</option>
              ))}
            </select>
          </label>
          <label>
            Group
            <select name="category" defaultValue="other">
              {page.categories.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            Budget (optional)
            <input name="budget" inputMode="decimal" placeholder="for example 250" />
          </label>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Add job</button>
        </form>
      </details>

      {page.months.length === 0 ? (
        <p className="club-attention__none">{page.filter === 'all' ? `No jobs for ${season === 'all' ? 'any season' : season} yet.` : 'Nothing matches that filter. Good news.'}</p>
      ) : (
        page.months.map((m) => (
          <section key={m.key} aria-labelledby={`m-${m.key}`}>
            <h2 id={`m-${m.key}`} className="club-page__subtitle">{m.label}</h2>
            <ul className="office-list">{m.jobs.map(job)}</ul>
          </section>
        ))
      )}
      <p className="club-muted">{page.total} {page.total === 1 ? 'job' : 'jobs'} in {season === 'all' ? 'all seasons' : season}.</p>
    </AdminPage>
  )
}
