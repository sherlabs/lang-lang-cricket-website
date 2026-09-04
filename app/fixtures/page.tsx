import { db } from '@/db'
import { fixtures } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function FixturesPage() {
  const rows = await db.select().from(fixtures).orderBy(asc(fixtures.matchDate))
  const upcoming = rows.filter((f) => !f.isResult)
  const results = rows.filter((f) => f.isResult)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Fixtures & Results</h1>
      <p className="mb-8 text-sm text-gray-600">
        Full ladder and draw:{' '}
        <a
          href="https://www.playhq.com/cricket-australia"
          target="_blank"
          className="underline"
        >
          view on PlayHQ
        </a>
      </p>

      <h2 className="mb-3 text-xl font-semibold">Upcoming</h2>
      <ul className="mb-10 divide-y">
        {upcoming.map((f) => (
          <li key={f.id} className="py-2">
            <span className="font-medium">{f.team}</span> vs {f.opponent} —{' '}
            {new Date(f.matchDate).toLocaleDateString('en-AU')} {f.venue && `@ ${f.venue}`}
          </li>
        ))}
        {upcoming.length === 0 && <li className="py-2 text-gray-500">No fixtures entered yet.</li>}
      </ul>

      <h2 className="mb-3 text-xl font-semibold">Recent Results</h2>
      <ul className="divide-y">
        {results.map((f) => (
          <li key={f.id} className="py-2">
            <span className="font-medium">{f.team}</span> vs {f.opponent} — {f.resultSummary}
          </li>
        ))}
        {results.length === 0 && <li className="py-2 text-gray-500">No results entered yet.</li>}
      </ul>
    </main>
  )
}
