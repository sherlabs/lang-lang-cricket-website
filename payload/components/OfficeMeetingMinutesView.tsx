import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { restrictedLine } from '@/lib/office/meetings'
import { getMinutesPage } from '@/lib/meetings-office-queries'
import { AdminPage, requireUser } from './AdminPage'

/**
 * `/admin/office/meetings/:id/minutes` (committee): the minutes as a plain page with print styles (use the browser's Print or
 * Save as PDF). Restricted items appear only for an office-bearer, in a separate part at the end.
 */
export async function OfficeMeetingMinutesView(view: AdminViewServerProps) {
  requireUser(view, '/office/meetings')
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const segments = (view.params?.segments as string[] | undefined) ?? []
  const id = Number(segments[segments.length - 2])
  const page = await getMinutesPage(req.user, id)
  const base = `${admin}/office/meetings`
  if (!page) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings', url: base }, { label: 'Not found' }]} />
        <h1 className="club-page__title">Minutes</h1>
        <p className="club-page__lead">Those minutes could not be found. <a href={base}>Back to Meetings</a></p>
      </AdminPage>
    )
  }
  return (
    <AdminPage view={view} className="office-print">
      <SetStepNav nav={[{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings', url: base }, { label: page.title, url: `${base}/${id}` }, { label: 'Minutes' }]} />
      <p className="office-actions office-noprint">
        <a href={`${base}/${id}`}>Back to the meeting</a>
        <span className="club-muted">Use your browser&rsquo;s Print, then Save as PDF if you want a file.</span>
      </p>
      <h1 className="club-page__title">{page.title}</h1>
      <p className="club-muted">{page.when}. Minutes {page.status === 'approved' ? 'approved' : 'in draft'}.</p>
      <pre className="office-minutes">{page.text}</pre>
      {page.annex ? (
        <>
          <h2 className="club-page__subtitle">Restricted items (office-bearers only)</h2>
          <pre className="office-minutes">{page.annex}</pre>
        </>
      ) : null}
      {!page.bearer && page.hiddenItems > 0 && !page.text.includes(restrictedLine(page.hiddenItems)) ? <p className="club-muted">{restrictedLine(page.hiddenItems)}</p> : null}
    </AdminPage>
  )
}
