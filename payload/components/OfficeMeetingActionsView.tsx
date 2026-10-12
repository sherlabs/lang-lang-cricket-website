import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { isMeetingError, isMeetingNotice, MEETING_ERROR_TEXT, MEETING_NOTICE_TEXT } from '@/lib/office/meetings'
import { getActionsPage } from '@/lib/meetings-office-queries'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STANDING = { overdue: 'Overdue', blocked: 'Blocked', 'due-soon': 'Due soon', open: 'Open', done: 'Done', dropped: 'Dropped' } as const

/** `/admin/office/meetings/actions` (committee): every open committee action, overdue first, filterable by seat. */
export async function OfficeMeetingActionsView(view: AdminViewServerProps) {
  requireUser(view, '/office/meetings')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/meetings`
  const sp = view.searchParams ?? {}
  const seatParam = Number(first(sp.seat))
  const page = await getActionsPage(req.user, Number.isInteger(seatParam) && seatParam > 0 ? seatParam : null)
  if (!page) return null
  const base = `${admin}/office/meetings`
  const notice = first(sp.notice)
  const error = first(sp.error)

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings', url: base }, { label: 'Committee actions' }]} />
      <h1 className="club-page__title">Committee actions</h1>
      <p className="club-page__lead">Jobs agreed at meetings that are not finished yet. {officeCopy.meetings.excludes}</p>
      <div role="status" aria-live="polite">
        {isMeetingNotice(notice) ? <p className="office-flash office-flash--ok">{MEETING_NOTICE_TEXT[notice]}</p> : null}
        {isMeetingError(error) ? <p className="office-flash office-flash--error">{MEETING_ERROR_TEXT[error]}</p> : null}
      </div>
      <form method="get" action={`${base}/actions`} className="office-filters" role="search">
        <label>
          Seat
          <select name="seat" defaultValue={page.seat ?? ''}>
            <option value="">All seats</option>
            {page.seats.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--style-primary btn--size-medium">Show</button>
      </form>
      {page.actions.length === 0 ? (
        <p className="club-attention__none">Nothing to do. No open committee actions{page.seat ? ' for that seat' : ''}.</p>
      ) : (
        <ul className="office-list">
          {page.actions.map((a) => (
            <li key={a.id}>
              <span className="office-badge">{STANDING[a.standing]}</span> {a.text}
              <span className="club-muted"> {a.owner ? `${a.owner}` : 'No owner'}{a.dueLabel ? `, due ${a.dueLabel}` : ''}. From <a href={`${base}/${a.meetingId}`}>{a.meetingTitle || 'a meeting'}</a>.</span>
              {a.restricted ? <span className="office-badge">Restricted</span> : null}
              <form method="post" action={`${api}/action-status`} className="office-inline">
                <input type="hidden" name="return" value="/office/meetings/actions" />
                <input type="hidden" name="id" value={a.id} />
                <button type="submit" name="status" value="done" className="btn btn--style-primary btn--size-medium">Done</button>
                <button type="submit" name="status" value={a.status === 'blocked' ? 'open' : 'blocked'} className="btn btn--style-secondary btn--size-medium">{a.status === 'blocked' ? 'Not blocked' : 'Blocked'}</button>
                <button type="submit" name="status" value="dropped" className="btn btn--style-secondary btn--size-medium">Drop</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  )
}
