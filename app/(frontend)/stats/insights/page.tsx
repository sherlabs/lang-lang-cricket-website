import Link from 'next/link'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { Panel } from '@/components/playhq/player-stats-tables'
import { InsightsFilters, InsightsTabs, Tiles } from '@/components/stats/insights-parts'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { INSIGHTS, insightsPaths } from '@/config/site'
import { gameViews } from '@/lib/insights/games'
import { NOT_COMPARABLE_TEXT, type MarginGroup, type NotComparable } from '@/lib/insights/margin'
import { fmt } from '@/lib/insights/num'
import { parseInsightsParams, insightsHref } from '@/lib/insights/params'
import { parScores, teamProfile, type Split } from '@/lib/insights/team-profile'
import { getClub } from '@/lib/club'
import { getAllFacts, filterMatchFacts } from '@/lib/match-store/stats-queries'
import { getInsightsExtras } from '@/lib/match-store/insights-queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { getStatsSettings } from '@/lib/site-settings'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { coverageCaption, coverageOf } from '@/lib/stats/match/coverage'
import { ALL, effectiveCategories, first } from '@/lib/stats/query-string'
import type { BowlerType } from '@/lib/stats/match/types'
import { cn } from '@/lib/utils'

// Same rendering mode as /stats: tag-cached data, rendered per request because of the filters.
export const revalidate = 900

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata({ searchParams }: Props) {
  const club = await getClub()
  const sp = await searchParams
  const filtered = first(sp.season) !== undefined || first(sp.grade) !== undefined
  return {
    title: titleWithSuffix(club, 'Team analysis'),
    description: `How ${club.name} bats, bowls and wins, from the stored match data: results, margins, totals and fielding.`,
    // A filtered view is a near-duplicate of the page: noindex, and a noindex page carries no canonical.
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor(insightsPaths.team) }),
    openGraph: baseOpenGraph(club),
  }
}

const head = 'text-brand-grey'
const num = 'tabular-nums text-right'
const pct = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(0)}%`)

const TYPE_LABEL: Record<BowlerType, string> = { bowled: 'Bowled', caught: 'Caught', caught_and_bowled: 'Caught and bowled', lbw: 'LBW', stumped: 'Stumped', hit_wicket: 'Hit wicket' }

function SplitRows({ rows }: { rows: readonly [string, Split][] }) {
  return (
    <>
      {rows.map(([label, s]) => (
        <TableRow key={label} className="border-brand-black/5">
          <TableCell className="font-semibold text-brand-black">{label}</TableCell>
          <TableCell className={num}>{s.played}</TableCell>
          <TableCell className={num}>{s.won}</TableCell>
          <TableCell className={num}>{s.lost}</TableCell>
          <TableCell className={num}>{s.drawn}</TableCell>
          <TableCell className={num}>{s.tied}</TableCell>
          <TableCell className={num}>{s.noResult}</TableCell>
          <TableCell className={num}>{pct(s.winPct)}</TableCell>
        </TableRow>
      ))}
    </>
  )
}

function MarginList({ title, g, min }: { title: string; g: MarginGroup; min: number }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-brand-black/5">
      <h4 className="text-sm font-semibold text-brand-black">{title}</h4>
      {g.n === 0 ? (
        <p className="mt-1 text-sm text-brand-grey">None.</p>
      ) : g.buckets === null ? (
        <p className="mt-1 text-sm text-brand-grey">{g.n} {g.n === 1 ? 'game' : 'games'}. Fewer than {min}, not enough for a spread.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {g.buckets.map((b) => (
            <li key={b.label} className="flex items-baseline justify-between gap-3">
              <span className="text-brand-charcoal">{b.label}</span>
              <span className="tabular-nums text-brand-black">{b.count} {b.count === 1 ? 'game' : 'games'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default async function TeamAnalysisPage({ searchParams }: Props) {
  const raw = await searchParams
  const [club, settings, all, extras] = await Promise.all([
    getClub(),
    getStatsSettings(),
    getAllFacts().catch((err) => {
      console.warn('[insights] match data unavailable:', (err as Error).message)
      return null
    }),
    getInsightsExtras().catch((err) => {
      console.warn('[insights] extras unavailable:', (err as Error).message)
      return null
    }),
  ])
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const base = all ? filterMatchFacts(all, { cats, rules: settings.gradeRules }) : null
  const labels = base ? buildLabelMap([...base.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade }))) : null
  const seasons = base ? [...new Map([...base.matches.values()].map((h) => [h.seasonName, h.seasonStartYear ?? 0])).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([s]) => s) : []
  const grades = base && labels ? [...new Set([...base.matches.values()].flatMap((h) => (h.grade ? [canonicalGrade(h.grade, labels)] : [])))].sort() : []
  const params = parseInsightsParams(raw, { seasons, grades, canonicalGrade: labels ? (g) => canonicalGrade(g, labels) : undefined })
  const set = base && labels
    ? filterMatchFacts(base, { season: params.season === ALL ? undefined : params.season, grade: params.grade === ALL ? undefined : params.grade })
    : null
  const profile = set && extras ? teamProfile({ set, toss: extras.toss, extras: extras.extras, winGames: settings.matchMinimums.winGames }) : null
  const par = set && labels ? parScores(gameViews(set), (g) => (g ? canonicalGrade(g, labels) : 'No grade recorded')) : []
  const caption = set ? coverageCaption(coverageOf(set)) : ''
  const min = INSIGHTS.teamMinGames

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Insights', href: insightsPaths.team }], club)} />
      <PageHeader eyebrow="Stats" title="Insights" intro={`How ${club.name} bats, bowls and wins, from the stored match data. Every figure shows how many games or innings are behind it.`} />
      <section className="container-site space-y-10 py-10 lg:py-14">
        <StatsSubNav current={insightsPaths.team} />
        <InsightsTabs current="team" params={params} />
        {!profile || !set || set.matches.size === 0 ? (
          <EmptyState>{set ? 'No stored games match this view yet, so there is nothing to analyse.' : 'Match data is not available right now.'}</EmptyState>
        ) : (
          <>
            <InsightsFilters action={insightsPaths.team} params={params} seasons={seasons} grades={grades} />
            <p className="text-sm text-brand-grey">
              {caption} Senior games only: junior games are not in the match data. A figure is left out (n/a) when too few games are behind it; the count is shown instead.
              {set.seasonCap ? ` Only the newest ${set.seasonCap.kept} of ${set.seasonCap.total} stored seasons are included.` : ''}
            </p>

            <div className="space-y-4">
              <SubHeading title="Results" count={profile.games} />
              <Panel title="Record">
                <div className="overflow-x-auto">
                  <Table className="min-w-[32rem]">
                    <caption className="sr-only">Record overall, batting first, batting second and by the toss. {caption}</caption>
                    <TableHeader>
                      <TableRow className="border-brand-black/10 hover:bg-transparent">
                        <TableHead scope="col" className={head}>Games</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>P</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>W</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>L</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>D</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>T</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>NR</TableHead>
                        <TableHead scope="col" className={cn(head, num)}>Win%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <SplitRows rows={[
                        ['Games with a result', profile.record],
                        ['Batting first', profile.battingFirst],
                        ['Batting second', profile.battingSecond],
                        ['Won the toss', profile.toss.won],
                        ['Lost the toss', profile.toss.lost],
                      ]} />
                    </TableBody>
                  </Table>
                </div>
              </Panel>
              <ul className="list-disc space-y-1 pl-5 text-sm text-brand-grey">
                <li>Forfeits ({profile.forfeits}) are left out of every row: a forfeit is never a win here. Win% is won over won, lost, drawn and tied games, and shows from {settings.matchMinimums.winGames} such games overall and {min} in a split.</li>
                <li>Batting first or second comes from the stored innings order{profile.orderUnknown ? `; ${profile.orderUnknown} ${profile.orderUnknown === 1 ? 'game has' : 'games have'} no readable order and ${profile.orderUnknown === 1 ? 'is' : 'are'} in neither row` : ''}.</li>
                <li>The toss is recorded for {profile.toss.recorded} of {profile.toss.recorded + profile.toss.notRecorded} games; the others are in neither toss row.</li>
              </ul>
            </div>

            <div className="space-y-4">
              <SubHeading title="Winning margins" />
              <p className="text-sm text-brand-grey">Only games with one innings each and a result. A win by batting first is a margin in runs; a win by chasing is wickets in hand (out of {INSIGHTS.wicketsInHand}). A spread shows from {min} such games.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <MarginList title="Our wins by runs" g={profile.margins.wins.runs} min={min} />
                <MarginList title="Our wins by wickets in hand" g={profile.margins.wins.wickets} min={min} />
                <MarginList title="Our losses by runs" g={profile.margins.losses.runs} min={min} />
                <MarginList title="Our losses by wickets in hand" g={profile.margins.losses.wickets} min={min} />
              </div>
              {profile.margins.notComparableTotal > 0 && (
                <p className="text-sm text-brand-grey">
                  Margin not comparable ({profile.margins.notComparableTotal}):{' '}
                  {(Object.entries(profile.margins.notComparable) as [NotComparable, number][]).map(([k, v]) => `${v} ${NOT_COMPARABLE_TEXT[k]}`).join(', ')}.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <SubHeading title="Batting" count={profile.batting.innings} />
              <Tiles items={[
                { label: 'Average total', value: fmt(profile.batting.mean, 0), note: `${profile.batting.withTotals} innings with a stored total${profile.batting.withoutTotals ? `, ${profile.batting.withoutTotals} without left out` : ''}` },
                { label: 'Highest total', value: fmt(profile.batting.highest, 0), note: `${profile.batting.withTotals} innings` },
                { label: 'Lowest completed total', value: fmt(profile.batting.lowestCompleted, 0), note: `Innings that ended all out (${profile.batting.allOut})` },
                { label: 'All out', value: pct(profile.batting.allOutRate), note: `${profile.batting.allOut} of ${profile.batting.innings} innings${profile.batting.allOutRate === null ? `, a rate needs ${min}` : ''}` },
                { label: 'Wickets lost per innings', value: fmt(profile.batting.meanWicketsLost), note: `${profile.batting.innings} innings` },
                { label: 'Extras per innings', value: fmt(profile.batting.extrasPerInnings), note: profile.batting.extrasInnings ? `${profile.batting.extrasInnings} innings with extras recorded` : 'Not recorded' },
                { label: 'Fifties', value: String(profile.batting.fifties), note: 'By players shown on this site' },
                { label: 'Hundreds', value: String(profile.batting.hundreds), note: 'By players shown on this site' },
                { label: 'Opening stand, average', value: fmt(profile.batting.stands.meanOpening, 0), note: `Inferred, from ${profile.batting.stands.openingStands} of ${profile.batting.stands.of} innings with usable fall of wickets` },
                { label: 'Highest stand', value: fmt(profile.batting.stands.highest, 0), note: 'Inferred, any wicket' },
              ]} />
            </div>

            <div className="space-y-4">
              <SubHeading title="Bowling" count={profile.bowling.innings} />
              <Tiles items={[
                { label: 'Average conceded', value: fmt(profile.bowling.meanConceded, 0), note: `${profile.bowling.withTotals} opposition innings with a stored total` },
                { label: 'Opposition all out', value: pct(profile.bowling.oppAllOutRate), note: `${profile.bowling.oppAllOut} of ${profile.bowling.innings} innings${profile.bowling.oppAllOutRate === null ? `, a rate needs ${min}` : ''}` },
                { label: 'Wides conceded per innings', value: fmt(profile.bowling.widesPerInnings), note: profile.bowling.extrasInnings ? `${profile.bowling.extrasInnings} innings with extras recorded` : 'Not recorded' },
                { label: 'No balls conceded per innings', value: fmt(profile.bowling.noBallsPerInnings), note: profile.bowling.extrasInnings ? `${profile.bowling.extrasInnings} innings with extras recorded` : 'Not recorded' },
              ]} />
              <Panel title="How our wickets came">
                <ul className="divide-y divide-brand-black/5 text-sm">
                  {(Object.keys(TYPE_LABEL) as BowlerType[]).map((k) => (
                    <li key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span className="text-brand-charcoal">{TYPE_LABEL[k]}</span>
                      <span className="tabular-nums text-brand-black">{profile.bowling.wickets.byType[k]}</span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="text-brand-charcoal">Run outs (fielding credits)</span>
                    <span className="tabular-nums text-brand-black">{profile.fielding.runOuts ?? 'not recorded'}</span>
                  </li>
                </ul>
                <p className="px-3 pb-3 text-xs text-brand-grey">
                  Wickets credited to bowlers shown on this site, in {profile.bowling.wickets.inningsUsed} of {profile.bowling.wickets.inningsOf} bowling innings whose scorecard agrees with the recorded dismissals.
                  Run outs are never credited to a bowler.
                </p>
              </Panel>
            </div>

            <div className="space-y-4">
              <SubHeading title="Typical winning totals" />
              <p className="text-sm text-brand-grey">Our total when we batted first, in games we won and games we lost, per grade. A typical total (the median) shows from {min} games in that group; below that only the count shows.</p>
              {par.length === 0 ? (
                <EmptyState>No game with a stored first-innings total and a result yet.</EmptyState>
              ) : (
                <Panel title="Batting first">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[28rem]">
                      <caption className="sr-only">Typical total when batting first, in wins and in losses, per grade.</caption>
                      <TableHeader>
                        <TableRow className="border-brand-black/10 hover:bg-transparent">
                          <TableHead scope="col" className={head}>Grade</TableHead>
                          <TableHead scope="col" className={cn(head, num)}>Typical winning total</TableHead>
                          <TableHead scope="col" className={cn(head, num)}>Games won</TableHead>
                          <TableHead scope="col" className={cn(head, num)}>Typical total in a loss</TableHead>
                          <TableHead scope="col" className={cn(head, num)}>Games lost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {par.map((r) => (
                          <TableRow key={r.grade} className="border-brand-black/5">
                            <TableCell className="font-semibold text-brand-black">{r.grade}</TableCell>
                            <TableCell className={num}>{r.winMedian === null ? 'n/a' : fmt(r.winMedian, 0)}</TableCell>
                            <TableCell className={num}>{r.winN}</TableCell>
                            <TableCell className={num}>{r.lossMedian === null ? 'n/a' : fmt(r.lossMedian, 0)}</TableCell>
                            <TableCell className={num}>{r.lossN}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </Panel>
              )}
            </div>

            <div className="space-y-4">
              <SubHeading title="Fielding" />
              <Tiles items={[
                { label: 'Catches', value: String(profile.fielding.catches), note: 'By players shown on this site' },
                { label: 'Stumpings', value: profile.fielding.stumpings === null ? 'not recorded' : String(profile.fielding.stumpings), note: `${profile.fielding.stumpingsRows} fielding records` },
                { label: 'Run outs', value: profile.fielding.runOuts === null ? 'not recorded' : String(profile.fielding.runOuts), note: `${profile.fielding.runOutRows} fielding records` },
              ]} />
              <p className="text-sm text-brand-grey">These are what the scorer entered. Dropped catches are not recorded anywhere, so no figure here counts them.</p>
            </div>
            <p className="text-sm"><Link href={insightsHref(insightsPaths.trends, params)} className="font-semibold text-brand-gold-deep underline underline-offset-2">See trends over time</Link></p>
          </>
        )}
      </section>
    </main>
  )
}
