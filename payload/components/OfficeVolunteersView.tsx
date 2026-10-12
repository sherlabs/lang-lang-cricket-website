import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { gameDayLabel } from '@/lib/office/game-day'
import { isVolunteerError, isVolunteerNotice, VOLUNTEER_ERROR_TEXT, VOLUNTEER_NOTICE_TEXT } from '@/lib/office/volunteer-input'
import { getVolunteersPage } from '@/lib/volunteers-office-queries'
import { currentClubDate } from '@/lib/selection/club-date'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const STATUS = { draft: 'Draft', open: 'Open for answers', confirmed: 'Confirmed' } as const

/**
 * `/admin/office/volunteers` (custom view, committee): the season's game days with how full each roster is, a way to create the
 * weeks from the home fixtures, and each volunteer's personal availability link. Every change is a plain form posted to the
 * volunteers route, so it works without scripts.
 */
export async function OfficeVolunteersView(view: AdminViewServerProps) {
  requireUser(view, '/office/volunteers')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office`
  const sp = view.searchParams ?? {}
  const page = await getVolunteersPage(req.user, first(sp.season) || null)
  if (!page) return null
  const { season } = page
  const base = `${admin}/office/volunteers`
  const notice = first(sp.notice)
  const error = first(sp.error)
  const today = currentClubDate()
  const hidden = <input type="hidden" name="return" value="/office/volunteers" />
  const seasonField = <input type="hidden" name="season" value={season} />

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Volunteers' }]} />
      <h1 className="club-page__title">Volunteers</h1>
      <p className="club-page__lead">Who is helping on each game day in {season}. Pick a game day to roster people, then confirm it afterwards to add the hours.</p>

      <div role="status" aria-live="polite">
        {isVolunteerNotice(notice) ? <p className="office-flash office-flash--ok">{VOLUNTEER_NOTICE_TEXT[notice]}{first(sp.n) ? ` (${first(sp.n)})` : ''}</p> : null}
        {isVolunteerError(error) ? <p className="office-flash office-flash--error">{VOLUNTEER_ERROR_TEXT[error]}</p> : null}
      </div>

      <form method="get" action={base} className="office-filters" role="search">
        <label>
          Season
          <select name="season" defaultValue={season}>
            {page.seasons.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn--style-primary btn--size-medium">Show season</button>
      </form>

      <p className="office-actions">
        <a className="btn btn--style-secondary btn--size-medium" href={`${base}/hours`}>Hours report</a>
        {page.isAdmin ? <a href={`${admin}/collections/volunteer-weeks`}>Advanced edit</a> : null}
      </p>

      {page.weeks.length === 0 ? (
        <p className="club-attention__none">No game days for {season} yet. Create them from the home games below, or add one by hand.</p>
      ) : (
        <table className="club-table office-table" role="table">
          <caption className="club-muted">Cancelled people and people who did not turn up are not counted as filling a place.</caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">Game day</th>
              <th scope="col" role="columnheader">Status</th>
              <th scope="col" role="columnheader">Places</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {page.weeks.map((w) => (
              <tr key={w.id} role="row">
                <th scope="row" role="rowheader" data-label="Game day">
                  <a href={`${base}/week/${w.id}`}>{gameDayLabel(w.date)}</a>
                  {w.label ? <span className="club-muted"> {w.label}</span> : null}
                  {w.date < today && w.status !== 'confirmed' ? <span className="club-muted"> (past, not confirmed yet)</span> : null}
                </th>
                <td role="cell" data-label="Status"><span className="office-badge">{STATUS[w.status]}</span></td>
                <td role="cell" data-label="Places">
                  <span className="office-status">
                    {w.slots === 0 ? 'No jobs added yet' : w.empty > 0 ? `! ${w.empty} of ${w.slots} places empty` : `✓ All ${w.slots} places filled`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details className="office-box" open={page.weeks.length === 0}>
        <summary>Add game days</summary>
        <form method="post" action={`${api}/volunteers/weeks-create`} className="office-form">
          {hidden}{seasonField}
          <p>{page.newDates.length === 0 ? `Every home game day in ${season} already has a week.` : `${page.newDates.length} home ${page.newDates.length === 1 ? 'game day has' : 'game days have'} no week yet.`}</p>
          <button type="submit" className="btn btn--style-primary btn--size-medium" disabled={page.newDates.length === 0}>Create weeks from the home games</button>
        </form>
        <form method="post" action={`${api}/volunteers/week-add`} className="office-form">
          {hidden}{seasonField}
          <label>Game day<input name="date" type="date" required /></label>
          <label>Label (optional)<input name="label" maxLength={80} autoComplete="off" /></label>
          <button type="submit" className="btn btn--style-secondary btn--size-medium">Add a week</button>
        </form>
      </details>

      <details className="office-box">
        <summary>Personal links for volunteers</summary>
        <p>Each volunteer has their own link where they say Yes, Maybe or No for each game day. Send it to them privately: anyone with the link can answer as that person, though they can see nothing about anyone else. &ldquo;New link&rdquo; makes the old one stop working.</p>
        {page.links.length === 0 ? (
          <p>No one has the volunteer or committee role yet. An admin can give people that role under Club office, then Members.</p>
        ) : (
          <ul className="office-list">
            {page.links.map((l) => (
              <li key={l.id}>
                <label>{l.name}
                  <input type="text" readOnly value={l.url} aria-label={`Link for ${l.name}`} />
                </label>
                <form method="post" action={`${api}/volunteers/link-rotate`} className="office-inline">
                  {hidden}
                  <input type="hidden" name="memberId" value={l.id} />
                  <button type="submit" className="btn btn--style-secondary btn--size-medium">New link for {l.name}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </details>
    </AdminPage>
  )
}
