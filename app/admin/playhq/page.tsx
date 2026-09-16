import { refreshPlayHQ } from './actions'

export const dynamic = 'force-dynamic'

const PLAYHQ_CLUB_URL = 'https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51'

export default function PlayHQAdminPage() {
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">PlayHQ</h1>
      <p className="mb-6 max-w-2xl text-sm text-gray-600">
        Fixtures, results, ladders and scorecards come live from PlayHQ and are cached for up to
        30 minutes. Use this after results are entered on PlayHQ to show them immediately.
      </p>
      <form
        action={async () => {
          'use server'
          await refreshPlayHQ()
        }}
        className="mb-6"
      >
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Refresh PlayHQ data
        </button>
      </form>
      <a href={PLAYHQ_CLUB_URL} target="_blank" rel="noopener noreferrer" className="text-sm underline">
        Open the club&apos;s PlayHQ page
      </a>
    </main>
  )
}
