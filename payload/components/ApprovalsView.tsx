import type { AdminViewServerProps } from 'payload'
import { CLUB_LOCALE } from '@/config/site'
import { SetStepNav } from '@payloadcms/ui'
import { AdminPage, requireUser } from './AdminPage'
import { ApprovalPhotos, type PendingPhotoItem } from './ApprovalPhotos'

const when = new Intl.DateTimeFormat(CLUB_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })

/** `/admin/approvals` (custom view): everything members sent in that is waiting for a decision. */
export async function ApprovalsView(view: AdminViewServerProps) {
  requireUser(view, '/approvals')
  const { req } = view.initPageResult
  const { payload } = req
  const adminRoute = payload.config.routes.admin

  const [stories, photos] = await Promise.all([
    payload.find({ collection: 'stories', where: { status: { equals: 'pending' } }, sort: 'createdAt', limit: 50, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'event-photos', where: { status: { equals: 'pending' } }, sort: 'createdAt', limit: 100, depth: 1, overrideAccess: true }),
  ])

  const photoItems: PendingPhotoItem[] = photos.docs.map((p) => {
    const event = typeof p.event === 'object' && p.event ? p.event : null
    return {
      id: p.id,
      url: p.url ?? null,
      caption: p.caption ?? '',
      submitterName: p.submitterName ?? '',
      eventTitle: event?.title ?? 'an event',
      eventHref: event ? `${adminRoute}/collections/events/${event.id}` : null,
    }
  })

  const nothing = stories.docs.length === 0 && photoItems.length === 0

  return (
    <AdminPage view={view}>
      <SetStepNav nav={[{ label: 'Waiting for approval' }]} />
      <h1 className="club-page__title">Waiting for approval</h1>
      <p className="club-page__lead">Stories and photos that members sent in from the website. Nobody sees them until you approve them.</p>

      {nothing && <p className="club-attention__none">Nothing is waiting. You are all caught up.</p>}

      {stories.docs.length > 0 && (
        <div className="club-field">
          <h2 className="club-field__title">Stories ({stories.docs.length})</h2>
          <ul className="club-approval-list">
            {stories.docs.map((s) => (
              <li key={s.id} className="club-approval-list__item">
                <div>
                  <p className="club-table__strong">{s.title}</p>
                  <p className="club-muted">
                    By {s.authorName || 'someone'} on {when.format(new Date(s.createdAt))}
                  </p>
                </div>
                <a className="club-button-link" href={`${adminRoute}/collections/stories/${s.id}`}>
                  Read and decide
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {photoItems.length > 0 && (
        <div className="club-field">
          <h2 className="club-field__title">Event photos ({photoItems.length})</h2>
          <ApprovalPhotos photos={photoItems} />
        </div>
      )}
    </AdminPage>
  )
}
