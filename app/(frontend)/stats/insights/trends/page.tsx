import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { InsightsFilters, InsightsTabs } from '@/components/stats/insights-parts'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { TrendChart } from '@/components/stats/trend-chart'
import { INSIGHTS, insightsPaths } from '@/config/site'
import { shortDate, shortDates } from '@/lib/insights/format'
import { byDate, gameViews } from '@/lib/insights/games'
import { fmt } from '@/lib/insights/num'
import { parseInsightsParams } from '@/lib/insights/params'
import { lastResults, rollingFirstInnings, seasonAverages, type StripCode } from '@/lib/insights/team-trends'
import { getClub } from '@/lib/club'
import { getAllFacts, filterMatchFacts, getVisiblePlayerNames } from '@/lib/match-store/stats-queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { getStatsSettings } from '@/lib/site-settings'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { coverageCaption, coverageOf, formatCoverageDate } from '@/lib/stats/match/coverage'
import { ALL, effectiveCategories, first } from '@/lib/stats/query-string'
import { shortSeason } from '@/lib/stats/season-window'

export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const club = await getClub()
  const sp = await searchParams
  const filtered = first(sp.season) !== undefined || first(sp.grade) !== undefined
  return {
    title: titleWithSuffix(club, 'Trends'),
    description: `Recent results, season averages and rolling totals for ${club.name}, from the stored match data.`,
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor(insightsPaths.trends) }),
    openGraph: baseOpenGraph(club),
  }
}

const WORD: Record<StripCode, string> = { W: 'Won', L: 'Lost', D: 'Drawn', T: 'Tied', NR: 'No result' }

export default async function TrendsPage({ searchParams }: Props) {
  const raw = await searchParams
  const [club, settings, all, names] = await Promise.all([
    getClub(),
    getStatsSettings(),
    getAllFacts().catch((err) => {
      console.warn('[insights] match data unavailable:', (err as Error).message)
      return null
    }),
    getVisiblePlayerNames().catch(() => null),
  ])
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const base = all ? filterMatchFacts(all, { cats, rules: settings.gradeRules }) : null
  const labels = base ? buildLabelMap([...base.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade }))) : null
  const seasons = base ? [...new Map([...base.matches.values()].map((h) => [h.seasonName, h.seasonStartYear ?? 0])).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s) : []
  const grades = base && labels ? [...new Set([...base.matches.values()].flatMap((h) => (h.grade ? [canonicalGrade(h.grade, labels)] : [])))].sort() : []
  const params = parseInsightsParams(raw, { seasons, grades, canonicalGrade: labels ? (g) => canonicalGrade(g, labels) : undefined })
  const set = base ? filterMatchFacts(base, { season: params.season === ALL ? undefined : params.season, grade: params.grade === ALL ? undefined : params.grade }) : null
  const games = set ? gameViews(set).sort(byDate) : []
  const strip = lastResults(games, INSIGHTS.stripGames)
  const avg = seasonAverages(games, INSIGHTS.trendSeasons)
  const first5 = rollingFirstInnings(games, INSIGHTS.rollingInnings)
  const caption = set ? coverageCaption(coverageOf(set)) : ''
  const gamesBy = new Map<number, Set<number>>()
  if (set) for (const a of set.appearances) (gamesBy.get(a.player) ?? gamesBy.set(a.player, new Set()).get(a.player)!).add(a.m)
  const players = names
    ? [...gamesBy].flatMap(([id, ms]) => { const p = names.get(id); return p?.slug && ms.size >= INSIGHTS.minGames ? [{ ...p, games: ms.size }] : [] })
        .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).slice(0, INSIGHTS.listPlayers)
    : []

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Insights', href: insightsPaths.team }, { name: 'Trends', href: insightsPaths.trends }], club)} />
      <PageHeader eyebrow="Stats" title="Trends" intro={`How ${club.name} has been going over time, from the stored match data.`} />
      <section className="container-site space-y-10 py-10 lg:py-14">
        <StatsSubNav current={insightsPaths.team} />
        <InsightsTabs current="trends" params={params} />
        {!set || set.matches.size === 0 ? (
          <EmptyState>{set ? 'No stored games match this view yet, so there is no trend to show.' : 'Match data is not available right now.'}</EmptyState>
        ) : (
          <>
            <InsightsFilters action={insightsPaths.trends} params={params} seasons={seasons} grades={grades} />
            <p className="text-sm text-brand-grey">
              {caption} Senior games only. A line is drawn only where enough games are behind it; a gap is a real gap, never zero.
              {set.seasonCap ? ` Only the newest ${set.seasonCap.kept} of ${set.seasonCap.total} stored seasons are included.` : ''}
            </p>

            <div className="space-y-4">
              <SubHeading title="Last results" count={strip.length} />
              {strip.length === 0 ? (
                <EmptyState>No game with a recorded result yet.</EmptyState>
              ) : (
                <>
                  <ol className="flex flex-wrap gap-2" aria-label={`The last ${strip.length} results, oldest first`}>
                    {strip.map((e) => (
                      <li key={e.key} className="min-w-[4.5rem] rounded-xl bg-white p-2 text-center shadow-card ring-1 ring-brand-black/5">
                        <span className="block text-lg font-bold text-brand-black"><span className="sr-only">{WORD[e.code]}{e.forfeit ? ' by forfeit' : ''}, </span><span aria-hidden>{e.code}{e.forfeit ? '*' : ''}</span></span>
                        <span className="block text-xs text-brand-grey">{shortDate(e.date)}</span>
                        <span className="block max-w-[6rem] truncate text-xs text-brand-charcoal" title={e.opp}>{e.opp}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-brand-grey">W won, L lost, D drawn, T tied, NR no result. A star marks a forfeit. Oldest on the left.</p>
                </>
              )}
            </div>

            <div className="space-y-4">
              <SubHeading title="Runs for and against" />
              {avg.rows.length === 0 || avg.rows.every((r) => r.forAvg === null && r.againstAvg === null) ? (
                <EmptyState>No innings with a stored team total yet.</EmptyState>
              ) : avg.rows.length === 1 ? (
                <EmptyState>Only 1 season stored, not enough for a trend. This season: {fmt(avg.rows[0].forAvg, 0)} for ({avg.rows[0].forN} innings), {fmt(avg.rows[0].againstAvg, 0)} against ({avg.rows[0].againstN} innings).</EmptyState>
              ) : (
                <TrendChart
                  idPrefix="ins-season-avg"
                  title="Average team total by season"
                  takeaway={`Average runs for and against in each of the last ${avg.rows.length} seasons. ${avg.rows.map((r) => `${shortSeason(r.season)}: ${fmt(r.forAvg, 0)} for, ${fmt(r.againstAvg, 0)} against`).join('. ')}.`}
                  legend="Bars: our average total. Line: the average total of the teams we played."
                  input={{
                    labels: avg.rows.map((r) => shortSeason(r.season)),
                    bars: avg.rows.map((r) => (r.forAvg === null ? null : { value: r.forAvg, text: fmt(r.forAvg, 0) })),
                    line: avg.rows.map((r) => r.againstAvg),
                    lineText: (v) => fmt(v, 0),
                  }}
                  tableHead={['Season', 'Games', 'For (innings)', 'Against (innings)']}
                  tableRows={avg.rows.map((r) => [shortSeason(r.season), String(r.games), `${fmt(r.forAvg, 0)} (${r.forN})`, `${fmt(r.againstAvg, 0)} (${r.againstN})`])}
                />
              )}
              {avg.cut > 0 && <p className="text-xs text-brand-grey">The newest {INSIGHTS.trendSeasons} seasons are shown; {avg.cut} older {avg.cut === 1 ? 'season is' : 'seasons are'} left out.</p>}
            </div>

            <div className="space-y-4">
              <SubHeading title="Batting first" count={first5.length} />
              {first5.length < 2 ? (
                <EmptyState>{first5.length === 0 ? 'No game with a stored first-innings total yet.' : 'Only 1 game stored when we batted first, not enough for a trend.'}</EmptyState>
              ) : (
                <TrendChart
                  idPrefix="ins-first-innings"
                  title="Our total when batting first"
                  takeaway={`${first5.length} games batting first. Latest total ${first5[first5.length - 1].total}${first5[first5.length - 1].rolling === null ? '' : `, rolling average of the last ${INSIGHTS.rollingInnings} is ${fmt(first5[first5.length - 1].rolling, 0)}`}.`}
                  legend={`Bars: our total. Line: the average of the last ${INSIGHTS.rollingInnings} such games, drawn once ${INSIGHTS.rollingInnings} exist.`}
                  input={{ labels: shortDates(first5.map((p) => p.date)), bars: first5.map((p) => ({ value: p.total, text: String(p.total) })), line: first5.map((p) => p.rolling), lineText: (v) => fmt(v, 0) }}
                  tableHead={['Game', 'Total', `Rolling (last ${INSIGHTS.rollingInnings})`]}
                  tableRows={first5.map((p) => [`${p.date ? formatCoverageDate(p.date) : 'No date'} v ${p.opp}`, String(p.total), p.rolling === null ? 'n/a' : fmt(p.rolling, 0)])}
                />
              )}
            </div>

            <div className="space-y-4">
              <SubHeading title="Player trends" count={players.length} />
              {players.length === 0 ? (
                <EmptyState>No player has {INSIGHTS.minGames} or more stored games in this view yet.</EmptyState>
              ) : (
                <>
                  <p className="text-sm text-brand-grey">Trends and season comparison for players with at least {INSIGHTS.minGames} stored games in this view{players.length >= INSIGHTS.listPlayers ? `, the ${INSIGHTS.listPlayers} with the most games` : ''}.</p>
                  <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {players.map((p) => (
                      <li key={p.id}>
                        <Link href={insightsPaths.player(p.slug)} className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-white px-4 py-2 text-sm shadow-card ring-1 ring-brand-black/5 hover:ring-brand-gold/60">
                          <span className="font-semibold text-brand-black">{p.name}</span>
                          <span className="tabular-nums text-brand-grey">{p.games} games</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
