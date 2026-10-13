import { SetStepNav } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import { DOCUMENT_CATEGORIES, isMeetingError, isMeetingNotice, MEETING_ERROR_TEXT, MEETING_NOTICE_TEXT, OFFICE_FILE_TOO_BIG } from '@/lib/office/meetings'
import { getDocumentsPage } from '@/lib/meetings-office-queries'
import { AdminPage, requireStaff } from './AdminPage'

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))
const CATEGORY: Record<(typeof DOCUMENT_CATEGORIES)[number], string> = { governance: 'Governance', finance: 'Finance', insurance: 'Insurance', legal: 'Legal', policy: 'Policy', other: 'Other' }

/**
 * `/admin/office/meetings/documents` (office-bearers): files only office-bearers can open. Downloads go through the
 * access-controlled file route, so a signed-out or non-office-bearer visitor gets nothing even with the address.
 */
export async function OfficeMeetingDocumentsView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/office/meetings')
  if (denied !== null) return denied
  const { req } = view.initPageResult
  const admin = req.payload.config.routes.admin
  const api = `${req.payload.config.routes.api}/admin/office/meetings`
  const sp = view.searchParams ?? {}
  const page = await getDocumentsPage(req.user)
  if (!page) return null
  const base = `${admin}/office/meetings`
  const crumbs = [{ label: 'Club office', url: `${admin}/office` }, { label: 'Meetings', url: base }, { label: 'Documents' }]
  if ('denied' in page) {
    return (
      <AdminPage view={view}>
        <SetStepNav nav={crumbs} />
        <h1 className="club-page__title">Office-bearer documents</h1>
        <p className="club-page__lead">These documents are for office-bearers only. An admin can mark your seat as an office-bearer seat and link your login to it. <a href={base}>Back to Meetings</a></p>
      </AdminPage>
    )
  }
  const notice = first(sp.notice)
  const error = first(sp.error)
  return (
    <AdminPage view={view}>
      <SetStepNav nav={crumbs} />
      <h1 className="club-page__title">Office-bearer documents</h1>
      <p className="club-page__lead">Insurance, governance and finance papers that only office-bearers can open. Files must be PDF, Word, Excel or an image. {OFFICE_FILE_TOO_BIG}</p>
      <div role="status" aria-live="polite">
        {isMeetingNotice(notice) ? <p className="office-flash office-flash--ok">{MEETING_NOTICE_TEXT[notice]}</p> : null}
        {isMeetingError(error) ? <p className="office-flash office-flash--error">{MEETING_ERROR_TEXT[error]}</p> : null}
      </div>
      <details className="office-box" open={page.documents.length === 0}>
        <summary>Add a document</summary>
        <form method="post" action={`${api}/document-add`} encType="multipart/form-data" className="office-form">
          <input type="hidden" name="return" value="/office/meetings/documents" />
          <label>Title<input name="title" required maxLength={160} autoComplete="off" /></label>
          <label>
            Category
            <select name="category" defaultValue="other">
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY[c]}</option>
              ))}
            </select>
          </label>
          <label>
            Meeting (optional)
            <select name="meetingId" defaultValue="">
              <option value="">Not linked to a meeting</option>
              {page.meetings.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </label>
          <label>File<input name="file" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" /></label>
          <button type="submit" className="btn btn--style-primary btn--size-medium">Add the document</button>
        </form>
      </details>
      {page.documents.length === 0 ? (
        <p className="club-attention__none">No documents yet.</p>
      ) : (
        <ul className="office-list">
          {page.documents.map((d) => (
            <li key={d.id}>
              <a href={`${page.apiBase}/office-files/file/${encodeURIComponent(d.filename)}`}>{d.title}</a>{' '}
              <span className="office-badge">{CATEGORY[d.category]}</span> <span className="club-muted">added {d.added}{d.meetingTitle ? `, from ${d.meetingTitle}` : ''}</span>
              {page.isAdmin ? (
                <form method="post" action={`${api}/document-remove`} className="office-inline">
                  <input type="hidden" name="return" value="/office/meetings/documents" />
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="btn btn--style-secondary btn--size-medium">Remove {d.title}</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AdminPage>
  )
}
