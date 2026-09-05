import { asc } from 'drizzle-orm'
import { CalendarDays, MapPin, ExternalLink } from 'lucide-react'
import { db } from '@/db'
import { fixtures } from '@/db/schema'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Fixtures & Results | Lang Lang Cricket Club',
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export default async function FixturesPage() {
  const rows = await db.select().from(fixtures).orderBy(asc(fixtures.matchDate))
  const upcoming = rows.filter((f) => !f.isResult)
  const results = rows.filter((f) => f.isResult).reverse()

  return (
    <main>
      <PageHeader
        eyebrow="Fixtures & results"
        title="This season's matches"
        intro="Upcoming games and recent results for our junior and senior sides."
      >
        <a
          href="https://www.playhq.com/cricket-australia"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
        >
          Full ladder and draw on PlayHQ
          <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </PageHeader>

      <section className="container-site grid gap-14 py-16 lg:grid-cols-2 lg:gap-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-brand-black">Upcoming</h2>
          <ul className="mt-6 space-y-3">
            {upcoming.map((f) => (
              <li key={f.id} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5">
                <p className="eyebrow">{f.team}</p>
                <p className="mt-1 text-lg font-bold tracking-tight text-brand-black">vs {f.opponent}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-neutral-600">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-brand-gold-dark" aria-hidden />
                    {formatDate(new Date(f.matchDate))}
                  </span>
                  {f.venue && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-brand-gold-dark" aria-hidden />
                      {f.venue}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {upcoming.length === 0 && (
              <li className="rounded-2xl bg-brand-stone p-6 text-sm text-neutral-500">
                No fixtures entered yet. Check PlayHQ for the latest draw.
              </li>
            )}
          </ul>
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight text-brand-black">Recent results</h2>
          <ul className="mt-6 space-y-3">
            {results.map((f) => (
              <li key={f.id} className="rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5">
                <p className="eyebrow">{f.team}</p>
                <p className="mt-1 text-lg font-bold tracking-tight text-brand-black">vs {f.opponent}</p>
                {f.resultSummary && <p className="mt-2 text-sm text-neutral-700">{f.resultSummary}</p>}
                <p className="mt-2 text-xs text-neutral-500">{formatDate(new Date(f.matchDate))}</p>
              </li>
            ))}
            {results.length === 0 && (
              <li className="rounded-2xl bg-brand-stone p-6 text-sm text-neutral-500">
                No results entered yet.
              </li>
            )}
          </ul>
        </div>
      </section>
    </main>
  )
}
