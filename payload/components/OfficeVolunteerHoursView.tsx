import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { isVolunteerError, isVolunteerNotice, VOLUNTEER_ERROR_TEXT, VOLUNTEER_NOTICE_TEXT } from '@/lib/office/volunteer-input'
import type { KindSummary, SmallCountTable } from '@/lib/office/volunteers'
import { getHoursReport } from '@/lib/volunteers-office-queries'
import { currentClubDate } from '@/lib/selection/club-date'
import { officeCopy } from '../admin/copy'
import { AdminPage, requireUser } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const KIND_TITLE = { volunteer: 'Volunteer hours', paid: 'Paid hours' } as const

function Breakdown({ title, table, label }: { title: string; table: SmallCountTable; label: (key: string) => string }) {
  return (
    <table className="club-table office-table" role="table">
      <caption className="club-muted">{title}</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">Group</th>
          <th scope="col" role="columnheader" className="office-num">Hours</th>
          <th scope="col" role="columnheader" className="office-num">People</th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {table.cells.map((c) => (
          <tr key={c.key} role="row">
            <th scope="row" role="rowheader" data-label="Group">{label(c.key)}</th>
            <td role="cell" className="office-num" data-label="Hours">{c.hours}</td>
            <td role="cell" className="office-num" data-label="People">{c.people}</td>
          </tr>
        ))}
        {table.other ? (
          <tr role="row">
            <th scope="row" role="rowheader" data-label="Group">Other (small groups together)</th>
            <td role="cell" className="office-num" data-label="Hours">{table.other.hours ?? officeCopy.volunteers.fewer}</td>
            <td role="cell" className="office-num" data-label="People">{table.other.people ?? ''}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

function KindBlock({ k, labels }: { k: KindSummary; labels: Record<string, string> }) {
  if (k.state === 'none') return <section className="office-box"><h2>{KIND_TITLE[k.kind]}</h2><p>No hours in this period.</p></section>
  if (k.state === 'hidden') return <section className="office-box"><h2>{KIND_TITLE[k.kind]}</h2><p>{officeCopy.volunteers.fewer}, so these hours are not shown. This stops a report from pointing at one person.</p></section>
  return (
    <section className="office-box">
      <h2>{KIND_TITLE[k.kind]}</h2>
      <p>{k.hours === null ? 'The total is not shown because a small group would be easy to work out from it.' : <><strong>{k.hours} hours</strong> from {k.people} people.</>}</p>
      {k.byType ? <Breakdown title="By job" table={k.byType} label={(key) => labels[key] ?? key} /> : null}
      {k.byMonth ? <Breakdown title="By month" table={k.byMonth} label={(key) => key} /> : null}
      {k.hours === null ? <p className="club-muted">{officeCopy.volunteers.withheld}</p> : null}
    </section>
  )
}

/**
 * `/admin/office/volunteers/hours` (custom view, committee): hours for a season or a date range. Everyone sees the name-free
 * aggregate, where any group of fewer than 3 people is hidden so a report cannot point at one volunteer. Admins also see each
 * person's paid and volunteer hours, can type in hours for ad-hoc work, void a mistake and download CSVs. Editors never see a person's
 * hours or whether they are paid.
 */
export async function OfficeVolunteerHoursView(view: AdminViewServerProps) {
  requireUser(view, '/office/volunteers')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office`
  const sp = view.searchParams ?? {}
  const report = await getHoursReport(req.user, { season: first(sp.season) || null, from: first(sp.from) || null, to: first(sp.to) || null })
  if (!report) return null
  const back = `${admin}/office/volunteers`
  const notice = first(sp.notice)
  const error = first(sp.error)
  const hidden = <input type="hidden" name="return" value="/office/volunteers/hours" />
  const period = (
    <>
      {report.season ? <input type="hidden" name="season" value={report.season} /> : <><input type="hidden" name="from" value={report.from} /><input type="hidden" name="to" value={report.to} /></>}
    </>
  )

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Volunteers', url: back }, { label: 'Hours' }]} />
      <h1 className="club-page__title">Volunteer hours</h1>
      <p className="club-page__lead">{report.label}. {officeCopy.volunteers.excludes}</p>

      <div role="status" aria-live="polite">
        {isVolunteerNotice(notice) ? <p className="office-flash office-flash--ok">{VOLUNTEER_NOTICE_TEXT[notice]}</p> : null}
        {isVolunteerError(error) ? <p className="office-flash office-flash--error">{VOLUNTEER_ERROR_TEXT[error]}</p> : null}
      </div>

      <form method="get" action={`${back}/hours`} className="office-filters" role="search">
        <label>Season
          <select name="season" defaultValue={report.season}>
            {report.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {report.isAdmin ? (
          <>
            <label>Or from<input name="from" type="date" defaultValue={report.season ? '' : report.from} /></label>
            <label>to<input name="to" type="date" defaultValue={report.season ? '' : report.to} /></label>
          </>
        ) : null}
        <button type="submit" className="btn btn--style-primary btn--size-medium">Show hours</button>
      </form>

      {report.aggregate.map((k) => <KindBlock key={k.kind} k={k} labels={report.shiftLabels} />)}

      {report.isAdmin && report.people ? (
        <>
          <section className="office-box" aria-labelledby="people">
            <h2 id="people">Hours by person (admins only)</h2>
            {report.people.length === 0 ? <p>No hours in this period.</p> : (
              <table className="club-table office-table" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    <th scope="col" role="columnheader">Person</th>
                    <th scope="col" role="columnheader" className="office-num">Volunteer hours</th>
                    <th scope="col" role="columnheader" className="office-num">Paid hours</th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {report.people.map((p) => (
                    <tr key={p.memberId} role="row">
                      <th scope="row" role="rowheader" data-label="Person">{p.name}</th>
                      <td role="cell" className="office-num" data-label="Volunteer hours">{p.volunteer}</td>
                      <td role="cell" className="office-num" data-label="Paid hours">{p.paid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {report.voidedCount ? <p className="club-muted">{report.voidedCount} voided {report.voidedCount === 1 ? 'entry is' : 'entries are'} not counted.</p> : null}
          </section>

          <details className="office-box">
            <summary>Add hours for other work (a working bee, for example)</summary>
            <form method="post" action={`${api}/volunteers/hours-add`} className="office-form">
              {hidden}
              <label>Person
                <select name="memberId" required defaultValue="">
                  <option value="" disabled>Pick a person</option>
                  {(report.roster ?? []).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
                </select>
              </label>
              <label>Date<input name="date" type="date" required max={currentClubDate()} /></label>
              <label>Hours<input name="hours" inputMode="decimal" required autoComplete="off" /></label>
              <label>Paid or volunteer
                <select name="kind" defaultValue="volunteer"><option value="volunteer">Volunteer</option><option value="paid">Paid</option></select>
              </label>
              <label>Job (optional)
                <select name="shiftTypeKey" defaultValue="">
                  <option value="">Other work</option>
                  {Object.entries(report.shiftLabels).filter(([key]) => key !== 'other').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label>Note (optional)<input name="note" maxLength={300} autoComplete="off" /></label>
              <button type="submit" className="btn btn--style-primary btn--size-medium">Add hours</button>
            </form>
          </details>

          <section className="office-box" aria-labelledby="recent">
            <h2 id="recent">Latest entries</h2>
            {report.recent && report.recent.length > 0 ? (
              <ul className="office-list">
                {report.recent.map((r) => (
                  <li key={r.id}>
                    <strong>{r.name}</strong>: {r.hours} {r.hours === 1 ? 'hour' : 'hours'} ({r.kind}), {r.shiftLabel}, {r.date}{r.source === 'manual' ? ', typed in' : ''}{r.note ? `. “${r.note}”` : ''}
                    <details className="office-void">
                      <summary>Void this entry</summary>
                      <form method="post" action={`${api}/volunteers/hours-void`} className="office-form">
                        {hidden}<input type="hidden" name="id" value={r.id} />
                        <label>Why?<input name="reason" required maxLength={300} autoComplete="off" /></label>
                        <button type="submit" className="btn btn--style-secondary btn--size-medium">Void</button>
                      </form>
                    </details>
                  </li>
                ))}
              </ul>
            ) : <p>No entries in this period.</p>}
          </section>

          <section className="office-box" aria-labelledby="export">
            <h2 id="export">Download as a spreadsheet</h2>
            <p>Every download is logged. Date of birth, emergency contact and notes are never included.</p>
            <div className="office-actions">
              <form method="post" action={`${api}/export/volunteer-hours`}>
                {period}<input type="hidden" name="scope" value="aggregate" />
                <button type="submit" className="btn btn--style-primary btn--size-medium">Totals without names (small groups hidden)</button>
              </form>
              <form method="post" action={`${api}/export/volunteer-hours`}>
                {period}<input type="hidden" name="scope" value="person" />
                <button type="submit" className="btn btn--style-secondary btn--size-medium">Hours by person</button>
              </form>
            </div>
          </section>
        </>
      ) : (
        <p className="club-muted">Hours for each person, and the downloads, are for admins only.</p>
      )}
    </AdminPage>
  )
}
