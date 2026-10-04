import { Suspense } from 'react'
import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { GameRows } from '@/components/playhq/game-rows'
import { PlayHQUnavailable } from '@/components/playhq/playhq-unavailable'
import { SeasonPicker } from '@/components/playhq/season-picker'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { getClub } from '@/lib/club'
import { buildMatchView, loadSeasonGames, matchGrades, parseMatchParams, RESULT_FILTERS, type LoadedSeason, type MatchFilters } from '@/lib/matches-queries'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { cn } from '@/lib/utils'

// PlayHQ-backed like /fixtures: ISR with the same 30 minute window as the fixture TTL.
export const revalidate = 1800

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams
  const filtered = Object.keys(sp).length > 0
  return {
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor('/matches') }),
    ...pageSeo(await getClub(), 'matches'),
  }
}

const RESULT_LABELS = { all: 'All results', won: 'Won', lost: 'Lost', other: 'Drawn or other' } as const

function hrefFor(season: string, f: Partial<MatchFilters>): string {
  const q = new URLSearchParams()
  q.set('season', season)
  if (f.grade) q.set('grade', f.grade)
  if (f.q) q.set('q', f.q)
  if (f.result && f.result !== 'all') q.set('result', f.result)
  if (f.page && f.page > 1) q.set('page', String(f.page))
  return `/matches?${q.toString()}`
}

const pill = (active: boolean) =>
  cn(
    'inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition',
    active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60',
  )

export default async function MatchesPage({ searchParams }: Props) {
  const raw = await searchParams
  const club = await getClub()
  const copy = club.pageCopy.matches
  // Read search params outside the try so Next's dynamic-rendering bail-out isn't swallowed.
  const seasonParam = typeof raw.season === 'string' ? raw.season : undefined
  let loaded: LoadedSeason | null = null
  try {
    loaded = await loadSeasonGames(seasonParam)
  } catch (err) {
    console.error('[playhq] matches page', err)
  }

  const header = <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
  const crumbs = <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Matches', href: '/matches' }], club)} />

  if (!loaded) {
    return (
      <main>
        {crumbs}
        {header}
        <section className="container-site space-y-8 py-12 lg:py-16">
          <StatsSubNav current="/matches" />
          <PlayHQUnavailable what="matches and results" />
        </section>
      </main>
    )
  }

  const { groups, season, games } = loaded
  const grades = matchGrades(games)
  const f = parseMatchParams(raw, grades)
  const view = buildMatchView(games, f)
  const filtered = !!(f.grade || f.q || f.result !== 'all')

  return (
    <main>
      {crumbs}
      {header}
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/matches" />

        <div className="space-y-5">
          <Suspense fallback={<div className="min-h-11" aria-hidden />}>
            <SeasonPicker groups={groups} current={season.name} basePath="/matches" />
          </Suspense>

          {grades.length > 0 && (
            <nav aria-label="Grade" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
              <ul className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
                <li><Link href={hrefFor(season.name, { q: f.q, result: f.result })} aria-current={!f.grade ? 'page' : undefined} className={pill(!f.grade)}>All grades</Link></li>
                {grades.map((g) => (
                  <li key={g}>
                    <Link href={hrefFor(season.name, { grade: g, q: f.q, result: f.result })} aria-current={f.grade === g ? 'page' : undefined} className={pill(f.grade === g)}>{g}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <form method="get" action="/matches" className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <input type="hidden" name="season" value={season.name} />
            {f.grade && <input type="hidden" name="grade" value={f.grade} />}
            <div>
              <label htmlFor="match-q" className="eyebrow">Opponent</label>
              <input id="match-q" name="q" type="search" maxLength={80} defaultValue={f.q} placeholder="Search by club name" className="mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black placeholder:text-brand-grey-light" />
            </div>
            <div>
              <label htmlFor="match-result" className="eyebrow">Result</label>
              <select id="match-result" name="result" defaultValue={f.result} className="mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black">
                {RESULT_FILTERS.map((r) => <option key={r} value={r}>{RESULT_LABELS[r]}</option>)}
              </select>
            </div>
            <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal">Apply</button>
          </form>
          <p className="text-sm text-brand-grey">{copy.coverageNote}</p>
        </div>

        <SubHeading title={f.grade ?? `${season.name} results`} count={view.total} />

        {view.narrowed && <p role="note" className="rounded-2xl bg-brand-gold-pale px-6 py-4 text-sm text-brand-gold-deep">{copy.narrowHint}</p>}

        {view.rounds.length === 0 ? (
          <EmptyState>{filtered ? copy.empty : 'No matches have finished in this season yet.'}</EmptyState>
        ) : (
          <div className="space-y-8">
            {view.rounds.map((r) => (
              <section key={r.key} aria-labelledby={`round-${r.key.replace(/\W+/g, '-')}`}>
                <h3 id={`round-${r.key.replace(/\W+/g, '-')}`} className="mb-2 text-sm font-bold text-brand-charcoal">{r.label}</h3>
                <div className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                  <GameRows games={r.games} variant="result" season={season.name} showTeam showDate caption={`${r.label} results`} />
                </div>
              </section>
            ))}
          </div>
        )}

        {view.pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between gap-4">
            {view.page > 1 ? (
              <Link href={hrefFor(season.name, { ...f, page: view.page - 1 })} rel="prev" className={pill(false)}>Newer rounds</Link>
            ) : <span />}
            <p className="text-sm tabular-nums text-brand-grey">Page {view.page} of {view.pages}</p>
            {view.page < view.pages ? (
              <Link href={hrefFor(season.name, { ...f, page: view.page + 1 })} rel="next" className={pill(false)}>Older rounds</Link>
            ) : <span />}
          </nav>
        )}
      </section>
    </main>
  )
}
