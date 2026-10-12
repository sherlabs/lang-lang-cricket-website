import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { isMeetingError, isMeetingNotice, MEETING_ERROR_TEXT, MEETING_NOTICE_TEXT, type MeetingKind } from '@/lib/office/meetings'
import { getMeetingsPage, type MeetingRow } from '@/lib/meetings-office-queries'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STATUS = { planned: 'Planned', 'in-progress': 'Under way', closed: 'Closed', cancelled: 'Cancelled' } as const

/**
 * `/admin/office/meetings` (custom view, committee): upcoming and past meetings, a form to start a new one from an agenda, the
 * committee seats, and links to committee actions and (for office-bearers) documents. Restricted meetings are listed only for
 * office-bearers; everyone else sees a count.
 */
export async function OfficeMeetingsView(view: AdminViewServerProps) {
  requireUser(view, '/office/meetings')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/meetings`
  const sp = view.searchParams ?? {}
  const page = await getMeetingsPage(req.user)
  if (!page) return null
  const base = `${admin}/office/meetings`
  const notice = first(sp.notice)
  const error = first(sp.error)
  const hidden = <input type="hidden" name="return" value="/office/meetings" />
  const kindLabel = (k: MeetingKind) => (k === 'annual' ? page.annualName : k === 'special' ? 'Special meeting' : 'Meeting')
  const list = (rows: MeetingRow[], empty: string) =>
    rows.length === 0 ? (
      <p className="club-attention__none">{empty}</p>
    ) : (
      <ul className="office-list">
        {rows.map((m) => (
          <li key={m.id}>
            <a href={`${base}/${m.id}`}>{m.title}</a> <span className="club-muted">{m.when}</span> <span className="office-badge">{STATUS[m.status]}</span>
            {m.kind !== 'ordinary' ? <span className="office-badge">{kindLabel(m.kind)}</span> : null}
            {m.restricted ? <span className="office-badge">Restricted</span> : null}
          </li>
        ))}
      </ul>
    )

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings' }]} />
      <h1 className="club-page__title">Meetings</h1>
      <p className="club-page__lead">Run committee meetings from an agenda: who came, what was decided, who does what by when, and the minutes.</p>

      <div role="status" aria-live="polite">
        {isMeetingNotice(notice) ? <p className="office-flash office-flash--ok">{MEETING_NOTICE_TEXT[notice]}{first(sp.n) ? ` (${first(sp.n)})` : ''}</p> : null}
        {isMeetingError(error) ? <p className="office-flash office-flash--error">{MEETING_ERROR_TEXT[error]}</p> : null}
      </div>

      <p className="office-actions">
        <a className="btn btn--style-secondary btn--size-medium" href={`${base}/actions`}>Committee actions</a>
        {page.bearer ? <a className="btn btn--style-secondary btn--size-medium" href={`${base}/documents`}>Office-bearer documents</a> : null}
      </p>

      <details className="office-box" open={page.upcoming.length === 0}>
        <summary>Start a new meeting</summary>
        {page.templates.length === 0 ? (
          <form method="post" action={`${api}/templates`} className="office-form">
            {hidden}
            <p>There are no agendas yet. This adds a standard committee agenda, a {page.annualName.toLowerCase()} agenda and a special meeting agenda that you can edit afterwards.</p>
            <button type="submit" className="btn btn--style-primary btn--size-medium">Add the standard agendas</button>
          </form>
        ) : (
          <form method="post" action={`${api}/create`} className="office-form">
            {hidden}
            <label>
              Agenda
              <select name="templateId" required>
                {page.templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.kind === 'annual' ? ` (${page.annualName})` : t.kind === 'special' ? ' (special, restricted)' : ''}</option>
                ))}
              </select>
            </label>
            <label>Date<input name="date" type="date" required defaultValue={page.today} /></label>
            <label>Time<input name="time" type="time" defaultValue="19:00" required /></label>
            <label>Title (optional)<input name="title" maxLength={120} autoComplete="off" /></label>
            <label>Where (optional)<input name="venue" maxLength={120} autoComplete="off" /></label>
            <p className="club-muted">Everyone who holds a seat starts as present, and open actions from earlier meetings are listed under Business arising.</p>
            <button type="submit" className="btn btn--style-primary btn--size-medium">Start the meeting</button>
          </form>
        )}
      </details>

      <h2 className="club-page__subtitle">Coming up</h2>
      {list(page.upcoming, 'No meetings planned.')}
      <h2 className="club-page__subtitle">Past meetings</h2>
      {list(page.past, 'No past meetings yet.')}
      {page.hiddenMeetings > 0 ? <p className="club-muted">{officeCopy.meetings.hiddenMeetings(page.hiddenMeetings)}</p> : null}

      <h2 className="club-page__subtitle">Committee seats</h2>
      {page.seats.length === 0 ? (
        <p className="club-attention__none">No seats yet.{page.isAdmin ? <> <a href={`${admin}/collections/committee-seats/create`}>Add the first seat</a>.</> : ' An admin can add them.'}</p>
      ) : (
        <table className="club-table office-table" role="table">
          <caption className="club-muted">Jobs and actions belong to the seat, so they stay with it when the holder changes. Only seats marked office-bearer (with a login) can open restricted minutes and documents.</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Seat</th>
              <th scope="col" role="columnheader">Held by</th>
              <th scope="col" role="columnheader">Office-bearer</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {page.seats.map((s) => (
              <tr key={s.id} role="row">
                <th scope="row" role="rowheader" data-label="Seat">{s.title}</th>
                <td role="cell" data-label="Held by">{s.holderName ?? 'Vacant'}</td>
                <td role="cell" data-label="Office-bearer">{s.officeBearer ? (s.holderUserId ? 'Yes' : 'Yes, but no login linked yet') : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {page.isAdmin ? (
        <p className="office-actions">
          <a href={`${admin}/collections/committee-seats`}>Edit seats</a>
          <a href={`${admin}/collections/meeting-templates`}>Edit agendas</a>
        </p>
      ) : null}
    </AdminPage>
  )
}
