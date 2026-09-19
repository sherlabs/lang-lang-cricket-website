import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon } from '@hugeicons/core-free-icons'
import { PLAYHQ_CLUB_URL } from '@/lib/playhq/format'
import { PlayHQRefreshForm } from '@/components/admin/playhq-refresh-form'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'

export default function PlayHQAdminPage() {
  return (
    <main>
      <AdminPageHeader
        eyebrow="PlayHQ"
        title="Fixtures & results"
        intro="Fixtures, results, ladders and scorecards come straight from PlayHQ. Nothing to enter here."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AdminCard title="Refresh now" description="Use this after results are entered on PlayHQ so the site shows them immediately.">
          <PlayHQRefreshForm />
        </AdminCard>

        <AdminCard title="How caching works">
          <dl className="grid gap-4 text-sm">
            <div>
              <dt className="font-semibold text-brand-black">Every 30 minutes</dt>
              <dd className="mt-1 text-brand-grey">
                The site re-fetches PlayHQ data on its own. Most updates appear within half an hour without doing anything.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-black">Where results are entered</dt>
              <dd className="mt-1 text-brand-grey">
                Scores, teams and ladders are managed on PlayHQ itself, not here.
              </dd>
            </div>
          </dl>
          <a
            href={PLAYHQ_CLUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-gold-deep hover:underline"
          >
            Open the club&apos;s PlayHQ page
            <HugeiconsIcon icon={ArrowUpRight01Icon} className="h-4 w-4" aria-hidden />
          </a>
        </AdminCard>
      </div>
    </main>
  )
}
