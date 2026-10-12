import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { DIARY_ERROR_TEXT, DIARY_NOTICE_TEXT, isDiaryError, isDiaryNotice, OBJECTIVE_STATUSES } from '@/lib/office/diary'
import { getPlanPage } from '@/lib/diary-office-queries'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STATUS_TEXT: Record<(typeof OBJECTIVE_STATUSES)[number], string> = { 'not-started': 'Not started', 'on-track': 'On track', 'at-risk': 'At risk', done: 'Done', dropped: 'Dropped' }
const JOB_TEXT = { todo: 'To do', 'in-progress': 'In progress', blocked: 'Blocked', done: 'Done' } as const

/**
 * `/admin/office/plan` (committee): the strategic plan as pillars, objectives and the diary jobs linked to each objective, with
 * progress written in words and shown as a bar. Prints cleanly (browser print to PDF).
 */
export async function OfficePlanView(view: AdminViewServerProps) {
  requireUser(view, '/office/plan')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/diary`
  const sp = view.searchParams ?? {}
  const page = await getPlanPage(req.user)
  if (!page) return null
  const notice = first(sp.notice)
  const error = first(sp.error)
  const hidden = <input type="hidden" name="return" value="/office/plan" />

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Diary & plan', url: `${admin}/office/diary` }, { label: 'Strategic plan' }]} />
      <h1 className="club-page__title">Strategic plan</h1>
      <p className="club-page__lead">What the club wants to achieve, in themes (pillars) and objectives. Link season diary jobs to an objective and its progress fills in by itself.</p>

      <div role="status" aria-live="polite">
        {isDiaryNotice(notice) ? <p className="office-flash office-flash--ok">{DIARY_NOTICE_TEXT[notice]}{first(sp.n) ? ` (${first(sp.n)})` : ''}</p> : null}
        {isDiaryError(error) ? <p className="office-flash office-flash--error">{DIARY_ERROR_TEXT[error]}</p> : null}
      </div>

      <div className="office-actions office-noprint">
        <a className="btn btn--style-secondary btn--size-medium" href={`${admin}/office/diary`}>Season diary</a>
        {page.canAddStarter ? (
          <form method="post" action={`${api}/starter-plan`} className="office-inline">
            {hidden}
            <button type="submit" className="btn btn--style-primary btn--size-medium">Add a starter plan</button>
          </form>
        ) : null}
        <span className="club-muted">Use your browser&rsquo;s Print, then Save as PDF, for a copy to share.</span>
      </div>

      {page.pillars.length === 0 ? <p className="club-attention__none">No plan yet. Add a starter plan to begin, or add your own pillar below.</p> : null}

      {page.pillars.map((p) => (
        <section key={p.id} className="plan-pillar" aria-labelledby={`p-${p.id}`}>
          <h2 id={`p-${p.id}`} className="club-page__subtitle">{p.title}</h2>
          {p.summary ? <p className="club-muted">{p.summary}</p> : null}
          {p.objectives.length === 0 ? <p className="club-muted">No objectives under this pillar yet.</p> : null}
          <ul className="office-list">
            {p.objectives.map((o) => (
              <li key={o.id}>
                <p>
                  <span className="office-badge">{STATUS_TEXT[o.status]}</span> <strong>{o.title}</strong>
                </p>
                <p className="club-muted">
                  {o.ownerLabel ?? 'No owner'}
                  {o.targetLabel ? `. Aim to finish by ${o.targetLabel}` : ''}
                  {o.budgetText ? `. Budget ${o.budgetText}` : ''}
                </p>
                <p>
                  {o.progressText}
                  {o.progress.budgetWarning ? <span className="office-badge">{officeCopy.diary.budgetWarning}</span> : null}
                </p>
                <progress value={o.progress.percent} max={100} aria-label={`${o.title}: ${o.progress.percent} percent of jobs done`} className="plan-progress" />
                {o.progressNote ? <p>{o.progressNote}</p> : null}
                {o.jobs.length > 0 ? (
                  <ul className="plan-jobs">
                    {o.jobs.map((j) => (
                      <li key={j.id}>
                        {JOB_TEXT[j.status]}: {j.title}
                        {j.dueLabel ? ` (due ${j.dueLabel}, ${j.season})` : ` (${j.season})`}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <details className="office-noprint">
                  <summary>Update this objective</summary>
                  <form method="post" action={`${api}/objective-save`} className="office-form">
                    {hidden}
                    <input type="hidden" name="id" value={o.id} />
                    <label>
                      Status
                      <select name="status" defaultValue={o.status}>
                        {OBJECTIVE_STATUSES.map((s) => (
                          <option key={s} value={s}>{STATUS_TEXT[s]}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Progress note
                      <textarea name="progressNote" className="office-textarea" maxLength={1000} defaultValue={o.progressNote} />
                    </label>
                    <label>
                      Budget (optional)
                      <input name="budget" inputMode="decimal" defaultValue={o.budgetInput} placeholder="for example 3000" />
                    </label>
                    <p className="club-muted">Empty the budget box to remove the budget.</p>
                    <button type="submit" className="btn btn--style-primary btn--size-medium">Save</button>
                  </form>
                  <form method="post" action={`${api}/job-add`} className="office-form">
                    {hidden}
                    <input type="hidden" name="objective" value={o.id} />
                    <input type="hidden" name="jobSeason" value={page.season} />
                    <p><strong>Add a job to this objective</strong></p>
                    <label>
                      Job
                      <input name="title" required maxLength={160} />
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
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Budget (optional)
                      <input name="budget" inputMode="decimal" />
                    </label>
                    <button type="submit" className="btn btn--style-secondary btn--size-medium">Add job</button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
          <details className="office-noprint">
            <summary>Add an objective to {p.title}</summary>
            <form method="post" action={`${api}/objective-add`} className="office-form">
              {hidden}
              <input type="hidden" name="pillar" value={p.id} />
              <label>
                Objective
                <input name="title" required maxLength={160} />
              </label>
              <label>
                Aim to finish by
                <input name="targetDate" type="date" />
              </label>
              <label>
                Owned by
                <select name="ownerSeat" defaultValue="">
                  <option value="">Nobody yet</option>
                  {page.seats.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Budget (optional)
                <input name="budget" inputMode="decimal" />
              </label>
              <button type="submit" className="btn btn--style-primary btn--size-medium">Add objective</button>
            </form>
          </details>
        </section>
      ))}

      <details className="office-noprint office-quickadd">
        <summary>Add a pillar</summary>
        <form method="post" action={`${api}/pillar-add`} className="office-form">
          {hidden}
          <label>
            Pillar
            <input name="title" required maxLength={120} />
          </label>
          <label>
            What it is about (optional)
            <textarea name="summary" className="office-textarea" maxLength={600} />
          </label>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Add pillar</button>
        </form>
      </details>
      {page.unlinked > 0 ? <p className="club-muted">{page.unlinked} diary {page.unlinked === 1 ? 'job is' : 'jobs are'} not linked to an objective, so they do not count towards the plan.</p> : null}
    </AdminPage>
  )
}
