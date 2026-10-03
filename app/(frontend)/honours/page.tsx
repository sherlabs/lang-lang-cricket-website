import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/playhq/player-stats-tables'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { getClub } from '@/lib/club'
import { getStatsSettings } from '@/lib/site-settings'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { buildHonourBoard } from '@/lib/stats/honours'
import { getHonourPlayers } from '@/lib/stats/queries'
import { cn } from '@/lib/utils'

// Same rendering mode as the other stats routes (see /stats): ISR with tag-cached data.
export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams
  const isFiltered = sp.view !== undefined || sp.cat !== undefined
  return {
    ...(isFiltered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor('/honours') }),
    ...pageSeo(await getClub(), 'honours'),
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const pill = (active: boolean) =>
  cn(
    'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition',
    active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60',
  )

export default async function HonoursPage({ searchParams }: Props) {
  const [club, settings, players, sp] = await Promise.all([getClub(), getStatsSettings(), getHonourPlayers(), searchParams])
  const copy = club.pageCopy.honours
  const board = buildHonourBoard(players, settings.honourCategories)
  const view = one(sp.view) === 'year' ? 'year' : 'honour'
  // The category must be one of the categories present, so garbage falls back to "all".
  const cat = board.categories.includes(one(sp.cat)) ? one(sp.cat) : ''
  const href = (v: string, c: string) => {
    const q = new URLSearchParams()
    if (v === 'year') q.set('view', 'year')
    if (c) q.set('cat', c)
    const s = q.toString()
    return s ? `/honours?${s}` : '/honours'
  }
  const groups = board.byHonour.filter((g) => !cat || g.category === cat)
  const years = board.byYear
    .map((y) => ({ ...y, entries: y.entries.filter((e) => !cat || e.category === cat) }))
    .filter((y) => y.entries.length > 0)

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Honours', href: '/honours' }], club)} />
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/honours" />
        {board.total === 0 ? (
          <EmptyState>{copy.empty}</EmptyState>
        ) : (
          <>
            <div className="space-y-4">
              <nav aria-label="Honour views" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <ul className="flex w-max gap-2">
                  <li><Link href={href('honour', cat)} aria-current={view === 'honour' ? 'page' : undefined} className={pill(view === 'honour')}>{copy.byHonourLabel}</Link></li>
                  <li><Link href={href('year', cat)} aria-current={view === 'year' ? 'page' : undefined} className={pill(view === 'year')}>{copy.byYearLabel}</Link></li>
                </ul>
              </nav>
              {board.categories.length > 1 && (
                <nav aria-label="Honour categories" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                  <ul className="flex w-max gap-2">
                    <li><Link href={href(view, '')} aria-current={cat === '' ? 'page' : undefined} className={pill(cat === '')}>All</Link></li>
                    {board.categories.map((c) => (
                      <li key={c}><Link href={href(view, c)} aria-current={cat === c ? 'page' : undefined} className={pill(cat === c)}>{c}</Link></li>
                    ))}
                  </ul>
                </nav>
              )}
              <p className="text-sm text-brand-grey">
                Honours are taken from each player&rsquo;s page, as the club recorded them. Grouping by type is a best guess from the wording; anything unrecognised is listed under Other.
              </p>
            </div>

            {view === 'honour' ? (
              <div className="grid gap-6 lg:grid-cols-2">
                {groups.map((g) => (
                  <Panel key={g.key} title={g.title}>
                    <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">{g.category}</p>
                    <ul className="divide-y divide-brand-black/5">
                      {g.recipients.map((r, i) => (
                        <li key={`${r.playerId}-${i}`} className="flex items-baseline gap-4 px-3 py-2.5">
                          <span className="w-28 shrink-0 text-sm font-semibold tabular-nums text-brand-gold-deep">{r.years || 'Year not recorded'}</span>
                          <Link href={`/players/${r.slug}`} className="min-w-0 font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{r.name}</Link>
                        </li>
                      ))}
                    </ul>
                  </Panel>
                ))}
              </div>
            ) : (
              <div className="space-y-8">
                {years.map((y) => (
                  <div key={y.label} className="space-y-3">
                    <SubHeading title={y.label} count={y.entries.length} />
                    <ul className="divide-y divide-brand-black/5 rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                      {y.entries.map((e, i) => (
                        <li key={`${e.playerId}-${i}`} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                          <span className="font-semibold text-brand-black sm:w-1/2">{e.title}</span>
                          <span className="min-w-0">
                            <Link href={`/players/${e.slug}`} className="font-semibold text-brand-charcoal hover:text-brand-gold-deep hover:underline">{e.name}</Link>
                            {e.years && <span className="ml-2 text-sm text-brand-grey">({e.years})</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
