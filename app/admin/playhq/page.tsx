import { PLAYHQ_CLUB_URL } from '@/lib/playhq/format'
import { PlayHQRefreshForm } from '@/components/admin/playhq-refresh-form'

export default function PlayHQAdminPage() {
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">PlayHQ</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-600">
        Fixtures, results, ladders and scorecards come live from PlayHQ and are cached for up to
        30 minutes. Use this after results are entered on PlayHQ to show them immediately.
      </p>
      <PlayHQRefreshForm />
      <a href={PLAYHQ_CLUB_URL} target="_blank" rel="noopener noreferrer" className="text-sm underline">
        Open the club&apos;s PlayHQ page
      </a>
    </main>
  )
}
