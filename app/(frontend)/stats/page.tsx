import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { FilterBar } from '@/components/stats/filter-bar'
import { LeaderboardTable, type LeaderboardRow } from '@/components/stats/leaderboard-table'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { getClub } from '@/lib/club'
import { getStatsSettings } from '@/lib/site-settings'
import { availableCategories, boardContext, buildLeaderboard, filterRows, gradeNames } from '@/lib/stats/leaderboard'
import { GROUP_LABELS, getMetric, leaderboardMetrics } from '@/lib/stats/metrics'
import { ALL, effectiveCategories, parseStatsParams, statsHref } from '@/lib/stats/query-string'
import { qualifierText } from '@/lib/stats/qualify'
import { getLastSyncAt, getVisibleStatData, type PlayerLite } from '@/lib/stats/queries'
import { sinceLabel } from '@/lib/stats/season-window'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'
import { breadcrumbJsonLd, playerListJsonLd } from '@/lib/structured-data'

// Rendering mode, decided once for every stats route: ISR-style `revalidate = 900` (as /fixtures/[gameId]) rather than
// `force-dynamic`. `searchParams` makes each filtered view dynamic anyway; the tag-cached data layer
// (lib/stats/queries.ts) is what keeps those fast.
export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

const FILTER_KEYS = ['season', 'grade', 'metric', 'group', 'cat', 'juniors'] as const

export async function generateMetadata({ searchParams }: Props) {
  const sp = await searchParams
  const filtered = FILTER_KEYS.some((k) => sp[k] !== undefined)
  return {
    // Filtered views are near-duplicates of the base page: noindex and no canonical (noindex pages carry none).
    ...(filtered ? {} : { alternates: canonicalFor('/stats') }),
    ...pageSeo(await getClub(), 'stats'),
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
  }
}

const TOP_HUB = 10
const TOP_FULL = 50

const formatAsOf = (d: Date) => new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'Australia/Melbourne' }).format(d)

export default async function StatsPage({ searchParams }: Props) {
  const [club, settings, data, asOf] = await Promise.all([
    getClub(),
    getStatsSettings(),
    getVisibleStatData(),
    getLastSyncAt().catch(() => null),
  ])
  const copy = club.pageCopy.stats
  const rules = settings.gradeRules
  const rawParams = await searchParams
  const seasonNames = data.seasons.map((s) => s.seasonName)
  const parsed = parseStatsParams(rawParams, { seasons: seasonNames, grades: gradeNames(data.rows) })
  const cats = effectiveCategories(parsed, settings.defaultIncludedCategories)
  // A grade outside the chosen categories is not selectable, so treat it as "All grades" rather than show nothing.
  const gradeOptions = gradeNames(filterRows(data.rows, { cats, rules }))
  const params = parsed.grade !== ALL && !gradeOptions.includes(parsed.grade) ? { ...parsed, grade: ALL } : parsed
  const hasJuniors = availableCategories(data.rows, rules).includes('junior')
  const scopeLabel = params.season === ALL ? sinceLabel(data.rows) : params.season
  const scopeText = `${scopeLabel}${params.grade !== ALL ? `, ${params.grade}` : ''}`

  const metrics = params.metricGiven ? [getMetric(params.metric)!] : leaderboardMetrics(params.group)
  const limit = params.metricGiven ? TOP_FULL : TOP_HUB

  const boards = metrics.map((metric) => {
    const lb = buildLeaderboard(data.rows, { season: params.season, grade: params.grade, metric: metric.key }, cats, settings)
    const ctx = boardContext(metric)
    const scope = settings.qualification[lb.scope]
    const note = qualifierText(metric.qualifier, scope)
    const ranked = lb.result.ranked.slice(0, limit)
    const rows: LeaderboardRow[] = ranked.flatMap((r) => {
      const p = data.players.get(r.item.playerId)
      return p ? [{ key: r.item.playerId, rank: r.rank, name: p.name, slug: p.slug, value: r.display, context: ctx.text(r.item.counts) }] : []
    })
    const unqualified = lb.result.unqualified.flatMap((u) => {
      const p = data.players.get(u.playerId)
      return p ? [{ p, display: metric.format(u.counts) }] : []
    })
    return { metric, ctx, note, rows, unqualified, total: lb.result.ranked.length, caption: `${metric.label}, ${scopeText}. ${note ?? ''} Ties share a rank.`.replace(/\s+/g, ' ') }
  })

  const anyRows = boards.some((b) => b.rows.length > 0)
  const top: PlayerLite[] = (boards[0]?.rows ?? []).map((r) => ({ id: Number(r.key), name: r.name, slug: r.slug }))
  const notes = [...new Set(boards.map((b) => b.note).filter((n): n is string => !!n))]

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }], club)} />
      <JsonLd data={playerListJsonLd(`${boards[0]?.metric.label ?? 'Leaderboard'} leaders`, top.slice(0, 10), club)} />
      <PageHeader eyebrow={copy.header.eyebrow} title={copy.header.title} intro={copy.header.intro} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current="/stats" />
        <FilterBar
          params={params}
          seasons={data.seasons.map((s) => s.seasonName)}
          grades={gradeOptions}
          showJuniors={hasJuniors}
        />

        <div className="space-y-2">
          <SubHeading title={`${GROUP_LABELS[params.group]}: ${scopeText}`} />
          <p className="text-sm text-brand-grey">
            {params.season === ALL ? 'Totals across every stored season. ' : 'Single-season figures, teams combined. '}
            {notes.join(' ')} Ties share a rank.
            {asOf ? ` Updated after the sync on ${formatAsOf(asOf)}.` : ''}
          </p>
        </div>

        {!anyRows ? (
          <EmptyState>{copy.empty}</EmptyState>
        ) : (
          <div className={params.metricGiven ? '' : 'grid gap-6 lg:grid-cols-2'}>
            {boards.map((b) => (
              <LeaderboardTable
                key={b.metric.key}
                title={b.metric.label}
                caption={b.caption}
                valueLabel={b.metric.short}
                contextLabel={b.ctx.label}
                rows={b.rows}
                footer={
                  <div className="space-y-3 px-3 pb-3 pt-1 text-sm">
                    {!params.metricGiven && b.total > b.rows.length && (
                      <Link href={statsHref('/stats', { ...params, metric: b.metric.key })} className="font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black">
                        View the full list<span className="sr-only"> for {b.metric.label}</span>
                      </Link>
                    )}
                    {params.metricGiven && b.total > b.rows.length && (
                      <p className="text-brand-grey">Showing the top {b.rows.length} of {b.total} ranked players.</p>
                    )}
                    {b.rows.length === 0 && <p className="text-brand-grey-light">Nobody has qualified yet.</p>}
                    {b.unqualified.length > 0 && (
                      <details className="text-brand-grey">
                        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-brand-gold-deep">
                          {copy.notEnoughHeading} ({b.unqualified.length})
                        </summary>
                        <p className="mb-2">{copy.notEnoughNote}</p>
                        <ul className="columns-1 gap-6 sm:columns-2">
                          {b.unqualified.slice(0, 60).map(({ p, display }) => (
                            <li key={p.id}>{p.name} <span className="tabular-nums text-brand-grey-light">({display})</span></li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
