import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { gameDayLabel } from '@/lib/office/game-day'
import { isVolunteerError, isVolunteerNotice, VOLUNTEER_ERROR_TEXT, VOLUNTEER_NOTICE_TEXT } from '@/lib/office/volunteer-input'
import { AVAILABILITY_LABEL, STATE_LABEL, type AssignmentState } from '@/lib/office/volunteers'
import { getWeekPage } from '@/lib/volunteers-office-queries'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STATUS = { draft: 'Draft', open: 'Open for answers', confirmed: 'Confirmed' } as const
const STATE_MARK: Record<AssignmentState, string> = { rostered: '', confirmed: '✓ ', 'no-show': '! ', cancelled: '' }

/**
 * `/admin/office/volunteers/week/:id` (custom view, committee): one game day. Jobs as cards with the people on them; for each
 * open place the people who said Yes come first, then Maybe, with how many shifts they already have this season. Warnings are
 * advice, not blocks. Confirming the week posts the hours and locks the roster; reopening voids them and unlocks it. An editor
 * sees "who is on what" but never whether a person is paid.
 */
export async function OfficeVolunteerWeekView(view: AdminViewServerProps) {
  requireUser(view, '/office/volunteers')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/volunteers`
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const weekId = Number(segments[segments.length - 1])
  const sp = view.searchParams ?? {}
  const page = await getWeekPage(req.user, weekId)
  const back = `${admin}/office/volunteers`
  if (!page) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Volunteers', url: back }, { label: 'Not found' }]} />
        <h1 className="club-page__title">Volunteer week</h1>
        <p className="club-page__lead">That game day could not be found. <a href={back}>Back to Volunteers</a></p>
      </AdminPage>
    )
  }
  const { week } = page
  const frozen = week.status === 'confirmed'
  const returnTo = `/office/volunteers/week/${week.id}`
  const hidden = <input type="hidden" name="return" value={returnTo} />
  const notice = first(sp.notice)
  const error = first(sp.error)
  const title = gameDayLabel(week.date)

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Volunteers', url: back }, { label: title }]} />
      <h1 className="club-page__title">{title}</h1>
      <p className="club-page__lead">
        {week.label ? `${week.label}. ` : ''}<span className="office-badge">{STATUS[week.status]}</span>{' '}
        {page.fill.slots === 0 ? 'No jobs added yet.' : page.fill.empty > 0 ? `! ${page.fill.empty} of ${page.fill.slots} places still empty.` : `✓ All ${page.fill.slots} places filled.`}
      </p>

      <div role="status" aria-live="polite">
        {isVolunteerNotice(notice) ? <p className="office-flash office-flash--ok">{VOLUNTEER_NOTICE_TEXT[notice]}</p> : null}
        {isVolunteerError(error) ? <p className="office-flash office-flash--error">{VOLUNTEER_ERROR_TEXT[error]}</p> : null}
      </div>
      {frozen ? <p className="office-flash">This week is confirmed, so the roster is locked and its hours are in the ledger. If someone did not turn up, mark them below. To change anything else, reopen the week.</p> : null}
      {page.posted ? <p className="club-muted">Hours posted for this week: {page.posted.live} live, {page.posted.voided} voided (voided hours stay as history).</p> : null}

      {page.warnings.length > 0 ? (
        <ul className="office-strip" aria-label="Things to check">
          <li><strong>Things to check (these do not stop you)</strong></li>
          {page.warnings.map((w, i) => <li key={i}>! {w.text}</li>)}
        </ul>
      ) : null}

      <div className="office-actions">
        {frozen ? (
          <form method="post" action={`${api}/reopen`}>
            {hidden}<input type="hidden" name="id" value={week.id} />
            <button type="submit" className="btn btn--style-secondary btn--size-medium">Reopen this week</button>
          </form>
        ) : (
          <>
            <form method="post" action={`${api}/week-status`}>
              {hidden}<input type="hidden" name="id" value={week.id} />
              <input type="hidden" name="status" value={week.status === 'open' ? 'draft' : 'open'} />
              <button type="submit" className="btn btn--style-secondary btn--size-medium">{week.status === 'open' ? 'Stop volunteers answering (back to draft)' : 'Open for answers'}</button>
            </form>
            <form method="post" action={`${api}/confirm`}>
              {hidden}<input type="hidden" name="id" value={week.id} />
              <button type="submit" className="btn btn--style-primary btn--size-medium">Confirm week and post hours</button>
            </form>
          </>
        )}
      </div>

      {page.shifts.length === 0 ? <p className="club-attention__none">No jobs on this game day yet. Add one below.</p> : null}
      {page.shifts.map((s) => (
        <section key={s.id} className="office-box" aria-labelledby={`shift-${s.id}`}>
          <h2 id={`shift-${s.id}`}>{s.labelSnapshot}</h2>
          <p className="club-muted">{s.hours} {s.hours === 1 ? 'hour' : 'hours'} each, {s.slots} {s.slots === 1 ? 'person' : 'people'} needed. {s.slotsEmpty > 0 ? `! ${s.slotsEmpty} empty.` : '✓ Full.'}</p>
          {s.assignments.filter((a) => a.state !== 'cancelled').length === 0 ? <p>No one yet.</p> : (
            <ul className="office-list">
              {s.assignments.filter((a) => a.state !== 'cancelled').map((a) => (
                <li key={a.id}>
                  <strong>{a.name}</strong>: {STATE_MARK[a.state]}{STATE_LABEL[a.state]}{a.answer === 'no' ? ' (said No)' : ''}
                  {a.kind ? <> ({a.kind === 'paid' ? 'paid' : 'volunteer'})</> : null}{' '}
                  {frozen ? (
                    a.state === 'confirmed' || a.state === 'no-show' ? (
                      <form method="post" action={`${api}/assignment-state`} className="office-inline">
                        {hidden}<input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="state" value={a.state === 'confirmed' ? 'no-show' : 'confirmed'} />
                        <button type="submit" className="btn btn--style-secondary btn--size-medium">{a.state === 'confirmed' ? 'Did not turn up' : 'Turned up after all'}</button>
                      </form>
                    ) : null
                  ) : (
                    <>
                      <form method="post" action={`${api}/unassign`} className="office-inline">
                        {hidden}<input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="btn btn--style-secondary btn--size-medium" aria-label={`Take ${a.name} off ${s.labelSnapshot}`}>Take off</button>
                      </form>
                      {page.isAdmin ? (
                        <form method="post" action={`${api}/assignment-kind`} className="office-inline">
                          {hidden}<input type="hidden" name="id" value={a.id} />
                          <select name="kind" defaultValue={a.kind} aria-label={`Paid or volunteer for ${a.name}`}>
                            <option value="volunteer">Volunteer</option>
                            <option value="paid">Paid</option>
                          </select>
                          <button type="submit" className="btn btn--style-secondary btn--size-medium">Change</button>
                        </form>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {frozen ? null : (
            <>
              {s.candidates.length > 0 ? (
                <form method="post" action={`${api}/assign`} className="office-form">
                  {hidden}<input type="hidden" name="shiftId" value={s.id} />
                  <label>Add someone to {s.labelSnapshot}
                    <select name="memberId" required defaultValue="">
                      <option value="" disabled>Pick a person</option>
                      {s.candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.answer ? `said ${AVAILABILITY_LABEL[c.answer]}` : 'no answer'}{c.preferred ? ', likes this job' : ''}; {c.load} {c.load === 1 ? 'shift' : 'shifts'} this season)
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn btn--style-primary btn--size-medium">Add to roster</button>
                </form>
              ) : (
                <p className="club-muted">Everyone with the volunteer or committee role is already on this job.</p>
              )}
              {s.assignments.length === 0 ? (
                <form method="post" action={`${api}/shift-remove`} className="office-inline">
                  {hidden}<input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="btn btn--style-secondary btn--size-medium">Remove this job</button>
                </form>
              ) : null}
            </>
          )}
        </section>
      ))}

      {frozen ? null : (
        <details className="office-box">
          <summary>Add a job to this game day</summary>
          <form method="post" action={`${api}/shift-add`} className="office-form">
            {hidden}<input type="hidden" name="weekId" value={week.id} />
            <label>Job
              <select name="shiftTypeKey" required defaultValue="">
                <option value="" disabled>Pick a job</option>
                {page.shiftTypes.map((t) => <option key={t.key} value={t.key}>{t.label} ({t.defaultHours} hours, {t.defaultSlots} {t.defaultSlots === 1 ? 'person' : 'people'})</option>)}
              </select>
            </label>
            <label>Hours each (leave blank for the usual)<input name="hours" inputMode="decimal" autoComplete="off" /></label>
            <label>People needed (leave blank for the usual)<input name="slots" inputMode="numeric" autoComplete="off" /></label>
            <button type="submit" className="btn btn--style-primary btn--size-medium">Add job</button>
          </form>
          {page.isAdmin ? <p className="club-muted">New kinds of job are made in <a href={`${admin}/globals/office-settings`}>Club office settings</a>.</p> : null}
        </details>
      )}

      <section aria-labelledby="answers" className="office-box">
        <h2 id="answers">Who has answered</h2>
        {page.answers.length === 0 ? <p>No one has answered for this day yet.</p> : (
          <ul className="office-list">
            {page.answers.map((a) => <li key={a.memberId}><strong>{a.name}</strong>: {AVAILABILITY_LABEL[a.state]}{a.note ? `. “${a.note}”` : ''}</li>)}
          </ul>
        )}
        <p className="club-muted">People answer from their personal link on the Volunteers page.</p>
      </section>

      {!frozen && page.shifts.every((s) => s.assignments.length === 0) ? (
        <details className="office-box office-box--danger">
          <summary>Remove this game day</summary>
          <p>Removes the day, its jobs and the answers volunteers gave for it. It cannot be undone.</p>
          <form method="post" action={`${api}/week-delete`} className="office-form">
            {hidden}<input type="hidden" name="id" value={week.id} />
            <button type="submit" className="btn btn--style-primary btn--size-medium">Remove game day</button>
          </form>
        </details>
      ) : null}
    </AdminPage>
  )
}
