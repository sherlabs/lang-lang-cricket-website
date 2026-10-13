import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { InsightsFilters, InsightsTabs } from '@/components/stats/insights-parts'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { TrendChart } from '@/components/stats/trend-chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { INSIGHTS, insightsPaths } from '@/config/site'
import { fmt } from '@/lib/insights/num'
import { parseInsightsParams } from '@/lib/insights/params'
import { collapseSummary, fowInnings, sideTable, type Side } from '@/lib/insights/wickets'
import { getClub } from '@/lib/club'
import { getAllFacts, filterMatchFacts } from '@/lib/match-store/stats-queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { getStatsSettings } from '@/lib/site-settings'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { coverageCaption, coverageOf, formatCoverageDate } from '@/lib/stats/match/coverage'
import { REASON_TEXT } from '@/lib/stats/match/partnerships'
import { ALL, effectiveCategories, first } from '@/lib/stats/query-string'
import { PARTNERSHIP_REASONS } from '@/lib/stats/match/types'

export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const club = await getClub()
  const sp = await searchParams
  const filtered = first(sp.season) !== undefined || first(sp.grade) !== undefined
  return {
    title: titleWithSuffix(club, 'Wickets'),
    description: `The team score as each wicket fell and the collapses in ${club.name} games, from the stored fall of wickets.`,
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor(insightsPaths.wickets) }),
    openGraph: baseOpenGraph(club),
  }
}

const SIDE_TITLE: Record<Side, string> = { ours: 'Our batting', theirs: 'Opposition batting against us' }
const SIDE_NOTE: Record<Side, string> = { ours: 'How quickly we lost wickets.', theirs: 'How quickly we took wickets.' }
const GROUP_TITLE = { limited: 'Limited-overs games', timed: 'Two-day games' } as const
const head = 'text-brand-grey'
const num = 'tabular-nums text-right'
const score = (runs: number, wickets: number) => `${runs} for ${wickets}`

export default async function WicketsPage({ searchParams }: Props) {
  const raw = await searchParams
  const [club, settings, all] = await Promise.all([
    getClub(),
    getStatsSettings(),
    getAllFacts().catch((err) => {
      console.warn('[insights] match data unavailable:', (err as Error).message)
      return null
    }),
  ])
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const base = all ? filterMatchFacts(all, { cats, rules: settings.gradeRules }) : null
  const labels = base ? buildLabelMap([...base.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade }))) : null
  const seasons = base ? [...new Map([...base.matches.values()].map((h) => [h.seasonName, h.seasonStartYear ?? 0])).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s) : []
  const grades = base && labels ? [...new Set([...base.matches.values()].flatMap((h) => (h.grade ? [canonicalGrade(h.grade, labels)] : [])))].sort() : []
  const params = parseInsightsParams(raw, { seasons, grades, canonicalGrade: labels ? (g) => canonicalGrade(g, labels) : undefined })
  const set = base ? filterMatchFacts(base, { season: params.season === ALL ? undefined : params.season, grade: params.grade === ALL ? undefined : params.grade }) : null
  const fow = set ? fowInnings(set) : null
  const F = INSIGHTS.fow
  const tables = fow ? (['ours', 'theirs'] as const).map((side) => sideTable(fow.list, side, { minInnings: F.minInnings, minTimedGames: F.minTimedGames })) : []
  const collapses = set && fow ? collapseSummary(fow.list, set.partnerships, set.innings, { wickets: F.collapseWickets, runs: F.collapseRuns }) : null
  const caption = set ? coverageCaption(coverageOf(set)) : ''
  const rule = `${F.collapseWickets} wickets for ${F.collapseRuns} runs or fewer`
  const reasons = fow ? PARTNERSHIP_REASONS.flatMap((r) => ((fow.coverage.rejected[r] ?? 0) > 0 ? [`${fow.coverage.rejected[r]} ${REASON_TEXT[r]}`] : [])) : []

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Insights', href: insightsPaths.team }, { name: 'Wickets', href: insightsPaths.wickets }], club)} />
      <PageHeader eyebrow="Stats" title="Wickets" intro={`The team score as each wicket fell, and the collapses, in ${club.name} games.`} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current={insightsPaths.team} />
        <InsightsTabs current="wickets" params={params} />
        {!set || !fow || set.matches.size === 0 ? (
          <EmptyState>{set ? 'No stored games match this view yet, so there are no wickets to show.' : 'Match data is not available right now.'}</EmptyState>
        ) : (
          <>
            <InsightsFilters action={insightsPaths.wickets} params={params} seasons={seasons} grades={grades} />
            <div className="space-y-1 text-sm text-brand-grey">
              <p>{caption} Senior games only.</p>
              <p>
                Of {fow.coverage.innings} innings in this view, {fow.coverage.valid} have a usable fall of wickets and are used here.
                {fow.coverage.noFow > 0 ? ` ${fow.coverage.noFow} ${fow.coverage.noFow === 1 ? 'innings has' : 'innings have'} no fall of wickets and ${fow.coverage.noFow === 1 ? 'is' : 'are'} excluded.` : ''}
                {fow.coverage.rejectedTotal > 0 ? ` ${fow.coverage.rejectedTotal} ${fow.coverage.rejectedTotal === 1 ? 'was' : 'were'} rejected because the stored figures do not add up (${reasons.join(', ')}).` : ''}
              </p>
              <p>These are team scores when a wicket fell. PlayHQ does not record the over, so nothing here says when in the innings it happened. Each wicket averages only the innings that lost that many, so a later wicket can read lower than an earlier one.</p>
            </div>

            <div className="space-y-6">
              <SubHeading title="Score at each wicket" />
              {tables.map((t) => (
                <div key={t.side} className="space-y-4">
                  <h3 className="text-lg font-semibold text-brand-black">{SIDE_TITLE[t.side]} <span className="text-sm font-normal text-brand-grey">{SIDE_NOTE[t.side]}</span></h3>
                  {t.blocks.length === 0 && <EmptyState>No innings with a usable fall of wickets{t.timedLeftOut ? '' : ' in this view yet'}.</EmptyState>}
                  {t.blocks.map((b) => {
                    const shown = b.cells.filter((c) => c.mean !== null)
                    return shown.length === 0 ? (
                      <EmptyState key={b.group}>{GROUP_TITLE[b.group]}: {b.innings} innings so far, and a score at a wicket needs {F.minInnings} innings behind it.</EmptyState>
                    ) : (
                      <TrendChart
                        key={b.group}
                        idPrefix={`ins-fow-${t.side}-${b.group}`}
                        title={`${SIDE_TITLE[t.side]}: ${GROUP_TITLE[b.group].toLowerCase()}`}
                        takeaway={`Average team score when each wicket fell, over ${b.innings} innings in ${b.games} games. ${shown.map((c) => `Wicket ${c.wicket}: ${fmt(c.mean, 0)} (${c.n} innings)`).join('. ')}.`}
                        legend={`Bars: the average team score when that wicket fell. Needs ${F.minInnings} innings; a wicket with fewer is left out, not drawn as zero.`}
                        input={{ labels: b.cells.map((c) => `W${c.wicket}`), bars: b.cells.map((c) => (c.mean === null ? null : { value: c.mean, text: fmt(c.mean, 0) })) }}
                        tableHead={['Wicket', 'Average score', 'Lowest to highest', 'Innings']}
                        tableRows={b.cells.map((c) => [String(c.wicket), c.mean === null ? 'n/a' : fmt(c.mean, 0), c.min === null ? 'n/a' : `${c.min} to ${c.max}`, String(c.n)])}
                      />
                    )
                  })}
                  {t.timedLeftOut > 0 && (
                    <p className="text-xs text-brand-grey">{t.timedLeftOut} two-day {t.timedLeftOut === 1 ? 'game is' : 'games are'} left out: limited-overs and two-day scores are never averaged together, and two-day games get their own table from {F.minTimedGames} games.</p>
                  )}
                  {t.unknownFormat > 0 && <p className="text-xs text-brand-grey">{t.unknownFormat} innings left out because the game type was not recorded.</p>}
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <SubHeading title="Collapses" count={collapses?.entries.length} />
              <p className="text-sm text-brand-grey">
                A collapse here means {rule}. That is a threshold chosen for this page, not a fact in the scorebook. Overlapping spells count once, as one longer collapse.
              </p>
              {collapses && collapses.perSeason.length > 0 && (
                <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                  <Table>
                    <caption className="sr-only">Innings with a collapse, by season</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col" className={head}>Season</TableHead>
                        <TableHead scope="col" className={`${head} ${num}`}>Our innings with a collapse</TableHead>
                        <TableHead scope="col" className={`${head} ${num}`}>Opposition innings with a collapse</TableHead>
                        <TableHead scope="col" className={`${head} ${num}`}>Innings checked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {collapses.perSeason.map((s) => (
                        <TableRow key={s.season} className="border-brand-black/5">
                          <TableCell className="font-semibold text-brand-black">{s.season}</TableCell>
                          <TableCell className={num}>{s.ours}</TableCell>
                          <TableCell className={num}>{s.theirs}</TableCell>
                          <TableCell className={num}>{s.innings}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!collapses || collapses.entries.length === 0 ? (
                <EmptyState>No collapse of {rule} in the innings with a usable fall of wickets.</EmptyState>
              ) : (
                <>
                  <ul className="space-y-2">
                    {collapses.entries.slice(0, F.list).map((e) => (
                      <li key={`${e.header.id}-${e.seq}-${e.collapse.from}`} className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
                        <p className="text-sm font-semibold text-brand-black">
                          {e.side === 'ours' ? 'We lost' : 'We took'} {e.collapse.wickets} wickets for {e.collapse.runs} {e.collapse.runs === 1 ? 'run' : 'runs'}
                          <span className="font-normal text-brand-grey">, from {score(e.collapse.startScore, e.collapse.from - 1)} to {score(e.collapse.endScore, e.collapse.to)}</span>
                        </p>
                        <p className="mt-1 text-sm text-brand-grey">
                          <Link href={`/fixtures/${e.header.gameId}`} className="font-semibold text-brand-gold-deep underline-offset-2 hover:underline">
                            {e.header.date ? formatCoverageDate(e.header.date) : 'No date'} v {e.header.oppLabel}
                          </Link>
                          {e.group ? ` (${e.group === 'limited' ? 'limited overs' : 'two-day'})` : ''}
                        </p>
                        {e.side === 'ours' && (
                          <p className="mt-1 text-xs text-brand-grey">
                            {e.recovery === null ? 'Recovery stand: n/a (the partnerships could not be worked out for this innings).' : `Biggest stand after it: ${e.recovery} (inferred from the batting order and fall of wickets).`}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {collapses.entries.length > F.list && <p className="text-xs text-brand-grey">The newest {F.list} of {collapses.entries.length} are shown.</p>}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  )
}
