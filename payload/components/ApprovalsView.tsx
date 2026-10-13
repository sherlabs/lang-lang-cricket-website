// @committee-facing
import type { AdminViewServerProps } from 'payload'
import { CLUB_LOCALE } from '@/config/site'
import { SetStepNav } from '@payloadcms/ui'
import { AdminPage, requireStaff } from './AdminPage'
import { ApprovalPhotos, type PendingPhotoItem } from './ApprovalPhotos'
import { Card, Section } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { LinkButton } from './ui/Button'
import { PageHeader } from './ui/PageHeader'
import { StatusPill } from './ui/StatusPill'

const when = new Intl.DateTimeFormat(CLUB_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })

/** `/admin/approvals` (custom view): everything members sent in that is waiting for a decision. */
export async function ApprovalsView(view: AdminViewServerProps) {
  const denied = await requireStaff(view, '/approvals')
  if (denied !== null) return denied
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
      <PageHeader title="Waiting for approval" lead="Stories and photos that members sent in from the website. Nobody sees them until you approve them." />

      {nothing && <EmptyState icon="approvals">Nothing is waiting. You are all caught up.</EmptyState>}

      {stories.docs.length > 0 && (
        <Section id="stories" title="Stories" action={<StatusPill tone="warn" label={`${stories.docs.length} stories waiting`}>{stories.docs.length}</StatusPill>}>
          <ul className="club-approval-list">
            {stories.docs.map((s) => (
              <Card as="li" key={s.id} className="club-approval-list__item">
                <div>
                  <p className="club-table__strong">{s.title}</p>
                  <p className="club-muted">
                    By {s.authorName || 'someone'} on {when.format(new Date(s.createdAt))}
                  </p>
                </div>
                <LinkButton variant="secondary" href={`${adminRoute}/collections/stories/${s.id}`}>
                  Read and decide
                </LinkButton>
              </Card>
            ))}
          </ul>
        </Section>
      )}

      {photoItems.length > 0 && (
        <Section id="photos" title="Event photos" action={<StatusPill tone="warn" label={`${photoItems.length} photos waiting`}>{photoItems.length}</StatusPill>}>
          <ApprovalPhotos photos={photoItems} />
        </Section>
      )}
    </AdminPage>
  )
}
