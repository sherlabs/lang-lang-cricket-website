import Link from 'next/link'
import { listStories, approveStory, rejectStory } from './actions'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { buttonVariants } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function StoriesAdminPage() {
  const all = await listStories()
  const pending = all.filter((s) => s.status === 'pending')
  const published = all.filter((s) => s.status === 'published')

  return (
    <main>
      <AdminPageHeader
        eyebrow="Stories"
        title="Stories"
        intro="Review submissions from the community and publish the club's own stories."
      >
        <Link href="/admin/stories/new" className={buttonVariants({ variant: 'brand', size: 'xl' })}>
          New story
        </Link>
      </AdminPageHeader>

      <AdminCard
        title="Pending review"
        aside={<span className="text-sm text-brand-grey">{pending.length} waiting</span>}
        className="mb-8"
      >
        {pending.length === 0 ? (
          <EmptyState>Nothing waiting on review.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {pending.map((s) => (
              <li key={s.id} className="rounded-xl border border-brand-black/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-black">{s.title}</p>
                    <p className="text-sm text-brand-grey">
                      {s.authorName}
                      {s.authorEmail ? ` · ${s.authorEmail}` : ''} · {s.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ActionForm action={rejectStory.bind(null, s.id)}>
                      <SubmitButton variant="outline" pendingText="Rejecting…">
                        Reject
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={approveStory.bind(null, s.id)}>
                      <SubmitButton pendingText="Approving…">Approve</SubmitButton>
                    </ActionForm>
                  </div>
                </div>
                {s.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.coverImageUrl}
                    alt=""
                    className="mt-3 w-full max-w-xs rounded-lg"
                  />
                )}
                {/* eslint-disable-next-line react/no-danger -- content only ever comes from this app's own Tiptap editor, see lib/stories-content.ts */}
                <div
                  className="story-content mt-3 max-h-48 overflow-y-auto rounded-lg bg-brand-stone/60 p-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: s.contentHtml }}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard
        title="Published"
        aside={<span className="text-sm text-brand-grey">{published.length} total</span>}
        flush
      >
        {published.length === 0 ? (
          <EmptyState>No stories published yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-brand-black/5">
            {published.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-brand-black">{s.title}</p>
                  <p className="text-sm text-brand-grey">
                    {s.authorName} · {s.publishedAt?.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/stories/${s.id}/edit`}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-11' })}
                  >
                    Edit
                  </Link>
                  <ActionForm action={rejectStory.bind(null, s.id)}>
                    <SubmitButton variant="outline" pendingText="Unpublishing…">
                      Unpublish
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </main>
  )
}
