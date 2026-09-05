import { asc } from 'drizzle-orm'
import { HugeiconsIcon } from '@hugeicons/react'
import { CalendarDaysIcon, MapPinIcon, ExternalLinkIcon, TrophyIcon } from '@hugeicons/core-free-icons'
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

function dateParts(d: Date) {
  return {
    day: new Intl.DateTimeFormat('en-AU', { day: 'numeric' }).format(d),
    month: new Intl.DateTimeFormat('en-AU', { month: 'short' }).format(d),
  }
}

function ColumnHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="display text-3xl text-brand-black sm:text-4xl">{title}</h2>
      <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
        {count}
      </span>
      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
    </div>
  )
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
          href="https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
        >
          Full fixtures, ladders, results &amp; scorecards on PlayHQ
          <HugeiconsIcon icon={ExternalLinkIcon} className="h-4 w-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </PageHeader>

      <section className="container-site grid gap-16 py-16 lg:grid-cols-2 lg:gap-12 lg:py-24">
        <div>
          <ColumnHeading title="Upcoming" count={upcoming.length} />
          <ul className="mt-8 space-y-4">
            {upcoming.map((f) => {
              const date = new Date(f.matchDate)
              const { day, month } = dateParts(date)
              return (
                <li
                  key={f.id}
                  className="flex gap-5 rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover hover:ring-brand-gold/40"
                >
                  <div
                    aria-hidden
                    className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-black text-brand-gold"
                  >
                    <span className="display text-2xl leading-none">{day}</span>
                    <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
                      {month}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">{f.team}</p>
                    <p className="mt-1 text-lg font-bold tracking-tight text-brand-black">
                      vs {f.opponent}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-grey">
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon icon={CalendarDaysIcon} className="h-4 w-4 text-brand-gold-deep" aria-hidden />
                        {formatDate(date)}
                      </span>
                      {f.venue && (
                        <span className="inline-flex items-center gap-1.5">
                          <HugeiconsIcon icon={MapPinIcon} className="h-4 w-4 text-brand-gold-deep" aria-hidden />
                          {f.venue}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
            {upcoming.length === 0 && (
              <li className="rounded-2xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
                No fixtures entered yet.{' '}
                <a
                  href="https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black"
                >
                  Check PlayHQ for the latest draw.
                </a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <ColumnHeading title="Recent results" count={results.length} />
          <ul className="mt-8 space-y-4">
            {results.map((f) => (
              <li
                key={f.id}
                className="rounded-2xl border-l-4 border-brand-gold bg-white p-5 shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="eyebrow">{f.team}</p>
                    <p className="mt-1 text-lg font-bold tracking-tight text-brand-black">
                      vs {f.opponent}
                    </p>
                  </div>
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold-pale text-brand-gold-deep"
                  >
                    <HugeiconsIcon icon={TrophyIcon} className="h-4 w-4" />
                  </span>
                </div>
                {f.resultSummary && (
                  <p className="mt-3 text-sm leading-relaxed text-brand-charcoal">{f.resultSummary}</p>
                )}
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-grey">
                  <HugeiconsIcon icon={CalendarDaysIcon} className="h-3.5 w-3.5 text-brand-gold-deep" aria-hidden />
                  {formatDate(new Date(f.matchDate))}
                </p>
              </li>
            ))}
            {results.length === 0 && (
              <li className="rounded-2xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
                No results entered yet.{' '}
                <a
                  href="https://www.playhq.com/cricket-australia/org/lang-lang-cricket-club/484ced51"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black"
                >
                  See past results and scorecards on PlayHQ.
                </a>
              </li>
            )}
          </ul>
        </div>
      </section>
    </main>
  )
}
