import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { ATTENDANCE_STATES, isMeetingError, isMeetingNotice, MEETING_ERROR_TEXT, MEETING_NOTICE_TEXT, MOTION_RESULTS, type AttendanceState } from '@/lib/office/meetings'
import { currentOfficeBearers, getMeetingPage, type ActionView, type MeetingPage } from '@/lib/meetings-office-queries'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STATUS = { planned: 'Planned', 'in-progress': 'Under way', closed: 'Closed', cancelled: 'Cancelled' } as const
const ATT_LABEL: Record<AttendanceState, string> = { present: 'Present', apology: 'Apology', absent: 'Absent' }
const RESULT_LABEL = { carried: 'Carried', lost: 'Lost', tabled: 'Tabled', withdrawn: 'Withdrawn' } as const
const STANDING = { overdue: 'Overdue', blocked: 'Blocked', 'due-soon': 'Due soon', open: 'Open', done: 'Done', dropped: 'Dropped' } as const

/**
 * `/admin/office/meetings/:id` (custom view, committee): the run view of one meeting, phone first. Agenda as a list with the current
 * item open, attendance chips with a plain present count, quick add for motions and actions, and notes per item. Closing builds the
 * draft minutes. On a yearly general meeting an admin also sees "Hand over seats". Every control is a plain form.
 */
export async function OfficeMeetingView(view: AdminViewServerProps) {
  requireUser(view, '/office/meetings')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/meetings`
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const id = Number(segments[segments.length - 1])
  const sp = view.searchParams ?? {}
  const page = await getMeetingPage(req.user, id)
  const base = `${admin}/office/meetings`
  if (!page) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings', url: base }, { label: 'Not found' }]} />
        <h1 className="club-page__title">Meeting</h1>
        <p className="club-page__lead">That meeting could not be found, or it is restricted to office-bearers. <a href={base}>Back to Meetings</a></p>
      </AdminPage>
    )
  }
  const { meeting } = page
  const locked = meeting.status === 'closed' || meeting.status === 'cancelled'
  const ret = `/office/meetings/${meeting.id}`
  const hidden = <input type="hidden" name="return" value={ret} />
  const mid = <input type="hidden" name="meetingId" value={meeting.id} />
  const notice = first(sp.notice)
  const error = first(sp.error)
  // The current item is the first one with nothing recorded yet.
  const currentId = page.items.find((i) => !i.notes && !i.outcome && i.motions.length === 0 && i.actions.length === 0)?.id
  const bearers = page.isAdmin && meeting.kind === 'annual' ? await currentOfficeBearers(req.user) : null
  const attendees = new Set(page.attendance.map((a) => a.personId).filter((n): n is number => n !== null))

  const actionRow = (a: ActionView, withMeeting = false) => (
    <li key={a.id}>
      <span className="office-badge">{STANDING[a.standing]}</span> {a.text}
      <span className="club-muted"> {a.owner ?? 'No owner'}{a.dueLabel ? `, due ${a.dueLabel}` : ''}{withMeeting && a.meetingTitle ? `. From ${a.meetingTitle}` : ''}</span>
      {a.restricted ? <span className="office-badge">Restricted</span> : null}
      <form method="post" action={`${api}/action-status`} className="office-inline">
        {hidden}
        <input type="hidden" name="id" value={a.id} />
        {a.status !== 'done' ? <button type="submit" name="status" value="done" className="btn btn--style-secondary btn--size-medium">Done</button> : <button type="submit" name="status" value="open" className="btn btn--style-secondary btn--size-medium">Reopen action</button>}
        {a.status === 'open' ? <button type="submit" name="status" value="blocked" className="btn btn--style-secondary btn--size-medium">Blocked</button> : null}
      </form>
    </li>
  )

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings', url: base }, { label: meeting.title }]} />
      <h1 className="club-page__title">{meeting.title}</h1>
      <p className="club-page__lead">
        {meeting.when}{meeting.venue ? `, ${meeting.venue}` : ''}. <span className="office-badge">{STATUS[meeting.status]}</span>
        {meeting.kind === 'annual' ? <span className="office-badge">{page.annualName}</span> : null}
        {meeting.restricted ? <span className="office-badge">Restricted</span> : null}
      </p>
      <div role="status" aria-live="polite">
        {isMeetingNotice(notice) ? <p className="office-flash office-flash--ok">{MEETING_NOTICE_TEXT[notice]}{first(sp.n) ? ` (${first(sp.n)})` : ''}</p> : null}
        {isMeetingError(error) ? <p className="office-flash office-flash--error">{MEETING_ERROR_TEXT[error]}</p> : null}
      </div>
      {page.hiddenItems > 0 ? <p className="club-muted">{officeCopy.meetings.hiddenItems(page.hiddenItems)}</p> : null}

      <p className="office-actions">
        {meeting.status === 'planned' ? (
          <form method="post" action={`${api}/meeting-status`} className="office-inline">{hidden}{mid}<input type="hidden" name="status" value="in-progress" /><button type="submit" className="btn btn--style-primary btn--size-medium">Start the meeting</button></form>
        ) : null}
        {meeting.status === 'planned' || meeting.status === 'in-progress' ? (
          <form method="post" action={`${api}/meeting-status`} className="office-inline">{hidden}{mid}<input type="hidden" name="status" value="cancelled" /><button type="submit" className="btn btn--style-secondary btn--size-medium">Cancel the meeting</button></form>
        ) : null}
        {meeting.status === 'cancelled' ? (
          <form method="post" action={`${api}/meeting-status`} className="office-inline">{hidden}{mid}<input type="hidden" name="status" value="planned" /><button type="submit" className="btn btn--style-secondary btn--size-medium">Plan it again</button></form>
        ) : null}
        {meeting.status === 'closed' && meeting.minutesStatus !== 'approved' ? (
          <form method="post" action={`${api}/reopen`} className="office-inline">{hidden}{mid}<button type="submit" className="btn btn--style-secondary btn--size-medium">Reopen the meeting</button></form>
        ) : null}
        <a className="btn btn--style-secondary btn--size-medium" href={`${base}/${meeting.id}/minutes`}>Print the minutes</a>
      </p>

      {!locked ? (
        <details className="office-box">
          <summary>Chair, minute-taker and privacy</summary>
          <form method="post" action={`${api}/meeting-roles`} className="office-form">
            {hidden}{mid}
            <label>
              Chair
              <select name="chairSeat" defaultValue={meeting.chairSeatId ?? ''}>
                <option value="">Not set</option>
                {page.seats.map((s) => <option key={s.id} value={s.id}>{s.title}{s.holderName ? ` (${s.holderName})` : ''}</option>)}
              </select>
            </label>
            <label>
              Minute-taker
              <select name="minuteTakerSeat" defaultValue={meeting.minuteTakerSeatId ?? ''}>
                <option value="">Not set</option>
                {page.seats.map((s) => <option key={s.id} value={s.id}>{s.title}{s.holderName ? ` (${s.holderName})` : ''}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn--style-secondary btn--size-medium">Save</button>
          </form>
          {page.bearer ? (
            <form method="post" action={`${api}/meeting-restricted`} className="office-form">
              {hidden}{mid}
              <input type="hidden" name="restricted" value={meeting.restricted ? 'false' : 'true'} />
              <p>{meeting.restricted ? 'This whole meeting is restricted: only office-bearers can see it.' : 'Restricting the whole meeting hides it, its minutes and everything in it from committee members who are not office-bearers.'}</p>
              <button type="submit" className="btn btn--style-secondary btn--size-medium">{meeting.restricted ? 'Make the meeting visible to the committee' : 'Restrict the whole meeting'}</button>
            </form>
          ) : null}
        </details>
      ) : null}

      <h2 className="club-page__subtitle">Who is here</h2>
      <p className="club-muted" aria-live="polite">{page.presentCount} {page.presentCount === 1 ? 'person is' : 'people are'} present. Whether there was a quorum is for the minute-taker to write in the minutes.</p>
      <ul className="office-attendance">
        {page.attendance.map((a) => (
          <li key={a.id}>
            <form method="post" action={`${api}/attendance-row`}>
              {hidden}
              <input type="hidden" name="id" value={a.id} />
              <strong>{a.name}</strong>
              {ATTENDANCE_STATES.map((s) => (
                <button key={s} type="submit" name="state" value={s} disabled={locked} aria-pressed={a.state === s} className={`office-chip${a.state === s ? ' office-chip--on' : ''}`}>{ATT_LABEL[s]}</button>
              ))}
            </form>
          </li>
        ))}
      </ul>
      {!locked ? (
        <details className="office-box">
          <summary>Add someone</summary>
          <form method="post" action={`${api}/attendance`} className="office-form">
            {hidden}{mid}
            <label>
              From Committee &amp; contacts
              <select name="personId" required defaultValue="">
                <option value="" disabled>Pick a person</option>
                {page.people.filter((p) => !attendees.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>
              Here as
              <select name="state" defaultValue="present">
                {ATTENDANCE_STATES.map((s) => <option key={s} value={s}>{ATT_LABEL[s]}</option>)}
              </select>
            </label>
            <button type="submit" className="btn btn--style-secondary btn--size-medium">Add</button>
          </form>
          <form method="post" action={`${api}/guest`} className="office-form">
            {hidden}{mid}
            <label>A guest&rsquo;s name<input name="name" maxLength={80} required autoComplete="off" /></label>
            <button type="submit" className="btn btn--style-secondary btn--size-medium">Add guest</button>
          </form>
        </details>
      ) : null}

      <h2 className="club-page__subtitle">Agenda</h2>
      {page.items.map((item) => (
        <details key={item.id} className="office-box" open={item.id === currentId}>
          <summary>{item.order}. {item.title}{item.restricted ? ' (restricted)' : ''}</summary>
          {item.kind === 'minutes' && page.previousMinutes && !locked ? (
            <form method="post" action={`${api}/minutes-approve`} className="office-form">
              {hidden}{mid}
              <input type="hidden" name="previousId" value={page.previousMinutes.id} />
              <p>The minutes of <a href={`${base}/${page.previousMinutes.id}/minutes`}>{page.previousMinutes.title}</a> are still a draft.</p>
              <button type="submit" className="btn btn--style-primary btn--size-medium">Mark those minutes as approved</button>
            </form>
          ) : null}
          {item.kind === 'business' ? (
            page.carried.length > 0 ? (
              <>
                <p>Open actions from earlier meetings:</p>
                <ul className="office-list">{page.carried.map((a) => actionRow(a, true))}</ul>
              </>
            ) : (
              <p className="club-muted">No open actions from earlier meetings.</p>
            )
          ) : null}
          <form method="post" action={`${api}/item-save`} className="office-form">
            {hidden}
            <input type="hidden" name="id" value={item.id} />
            <label>Notes<textarea className="office-textarea" name="notes" defaultValue={item.notes} maxLength={8000} readOnly={locked} /></label>
            <label>Outcome<textarea className="office-textarea" name="outcome" defaultValue={item.outcome} maxLength={2000} readOnly={locked} /></label>
            {!locked ? <button type="submit" className="btn btn--style-secondary btn--size-medium">Save notes</button> : null}
          </form>
          {item.motions.length > 0 ? (
            <ul className="office-list">
              {item.motions.map((m) => (
                <li key={m.id}>
                  Motion: {m.text}
                  <span className="club-muted"> {[m.votesFor !== null ? `for ${m.votesFor}` : null, m.votesAgainst !== null ? `against ${m.votesAgainst}` : null, m.abstain !== null ? `abstain ${m.abstain}` : null].filter(Boolean).join(', ')}</span>
                  {m.result ? <span className="office-badge">{RESULT_LABEL[m.result]}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {item.actions.length > 0 ? <ul className="office-list">{item.actions.map((a) => actionRow(a))}</ul> : null}
          {!locked ? (
            <>
              <form method="post" action={`${api}/motion`} className="office-form">
                {hidden}{mid}
                <input type="hidden" name="itemId" value={item.id} />
                <label>Motion<textarea className="office-textarea" name="text" required maxLength={600} /></label>
                <div className="office-checks">
                  <label>For<input name="votesFor" type="number" min={0} max={9999} inputMode="numeric" /></label>
                  <label>Against<input name="votesAgainst" type="number" min={0} max={9999} inputMode="numeric" /></label>
                  <label>Abstained<input name="abstain" type="number" min={0} max={9999} inputMode="numeric" /></label>
                </div>
                <label>
                  Result
                  <select name="result" defaultValue="">
                    <option value="">Not decided yet</option>
                    {MOTION_RESULTS.map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
                  </select>
                </label>
                <button type="submit" className="btn btn--style-secondary btn--size-medium">Record the motion</button>
              </form>
              <form method="post" action={`${api}/action-add`} className="office-form">
                {hidden}{mid}
                <input type="hidden" name="itemId" value={item.id} />
                <label>Action<input name="text" required maxLength={400} autoComplete="off" /></label>
                <label>
                  Who (seat)
                  <select name="ownerSeat" defaultValue="">
                    <option value="">No one yet</option>
                    {page.seats.map((s) => <option key={s.id} value={s.id}>{s.title}{s.holderName ? ` (${s.holderName})` : ''}</option>)}
                  </select>
                </label>
                <label>Due<input name="due" type="date" /></label>
                <button type="submit" className="btn btn--style-secondary btn--size-medium">Add the action</button>
              </form>
            </>
          ) : null}
          {page.bearer ? (
            <form method="post" action={`${api}/item-restricted`} className="office-form">
              {hidden}
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="restricted" value={item.restricted ? 'false' : 'true'} />
              <button type="submit" className="btn btn--style-secondary btn--size-medium">{item.restricted ? 'Show this item to the whole committee' : 'Restrict this item to office-bearers'}</button>
            </form>
          ) : null}
        </details>
      ))}
      {!locked ? (
        <form method="post" action={`${api}/item-add`} className="office-form">
          {hidden}{mid}
          <label>Add an agenda item<input name="title" required maxLength={160} autoComplete="off" /></label>
          <button type="submit" className="btn btn--style-secondary btn--size-medium">Add item</button>
        </form>
      ) : null}

      {meeting.kind === 'annual' ? <HandoverStep page={page} api={api} ret={ret} bearers={bearers} admin={admin} /> : null}

      {!locked ? (
        <form method="post" action={`${api}/close`} className="office-form">
          {hidden}{mid}
          <p>Closing the meeting writes a draft of the minutes from what you recorded. You can edit it afterwards.</p>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Close the meeting and draft the minutes</button>
        </form>
      ) : null}

      {meeting.status === 'closed' ? (
        <>
          <h2 className="club-page__subtitle">Minutes ({meeting.minutesStatus === 'approved' ? 'approved' : 'draft'})</h2>
          <form method="post" action={`${api}/minutes-save`} className="office-form">
            {hidden}{mid}
            <label>
              Minutes
              <textarea className="office-textarea" name="text" rows={18} defaultValue={meeting.minutesText} maxLength={60000} readOnly={meeting.minutesStatus === 'approved'} />
            </label>
            {meeting.minutesStatus !== 'approved' ? <button type="submit" className="btn btn--style-primary btn--size-medium">Save the minutes</button> : <p className="club-muted">These minutes were approved and are locked.</p>}
          </form>
        </>
      ) : null}
    </AdminPage>
  )
}

function HandoverStep({ page, api, ret, bearers, admin }: { page: MeetingPage; api: string; ret: string; bearers: { seatHolders: string[]; admins: number } | null; admin: string }) {
  if (!page.isAdmin) return <p className="club-muted">An admin hands over the seats after the election.</p>
  const kindName = page.annualName
  return (
    <details className="office-box">
      <summary>Hand over seats after the election</summary>
      <form method="post" action={`${api}/handover`} className="office-form">
        <input type="hidden" name="return" value={ret} />
        <input type="hidden" name="meetingId" value={page.meeting.id} />
        <p>Pick the new holder of each seat. A seat you leave as it is stays as it is. Every seat you change loses its old login straight away, so the old holder can no longer open office-bearer documents; link the new holder&rsquo;s login only if they sign in to the admin. Jobs and actions stay with the seat. Held at the {kindName.toLowerCase()} on {page.meeting.when}.</p>
        {page.seats.map((s) => (
          <fieldset key={s.id}>
            <legend>{s.title} (now {s.holderName ?? 'vacant'})</legend>
            <label>
              New holder
              <select name={`seat_${s.id}_person`} defaultValue={s.holderId ?? 'vacant'}>
                <option value="vacant">Vacant</option>
                {page.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>
              Their login (optional)
              <select name={`seat_${s.id}_login`} defaultValue="">
                <option value="">No login for this seat</option>
                {page.logins.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
          </fieldset>
        ))}
        <button type="submit" className="btn btn--style-primary btn--size-medium">Hand over the seats</button>
      </form>
      <h3>After the handover</h3>
      <ul>
        <li>Update the public Committee &amp; contacts page by hand: <a href={`${admin}/collections/people`}>open Committee &amp; contacts</a>. It is not changed automatically.</li>
        <li>
          Who can now open office-bearer documents: {bearers ? (bearers.seatHolders.length ? bearers.seatHolders.join(', ') : 'no committee member') : '…'}, and {bearers?.admins ?? 0} site {bearers?.admins === 1 ? 'admin' : 'admins'}.
        </li>
      </ul>
    </details>
  )
}
