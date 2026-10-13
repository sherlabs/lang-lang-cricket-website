import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { EmptyState, SubHeading } from '@/components/stats/sub-heading'
import { TrendChart } from '@/components/stats/trend-chart'
import { INSIGHTS, insightsPaths } from '@/config/site'
import { shortDates } from '@/lib/insights/format'
import { fmt } from '@/lib/insights/num'
import { pickSeason } from '@/lib/insights/params'
import { battingPoints, bowlingPoints, compareSeasons, seasonLines, type CompareCell, type SeasonLine } from '@/lib/insights/player-trends'
import { getClub } from '@/lib/club'
import { filterMatchFacts, getPlayerMatchFacts } from '@/lib/match-store/stats-queries'
import { baseOpenGraph, canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { getStatsSettings } from '@/lib/site-settings'
import { breadcrumbJsonLd } from '@/lib/structured-data'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { formatCoverageDate } from '@/lib/stats/match/coverage'
import { effectiveCategories, first } from '@/lib/stats/query-string'
import { getVisibleStatData } from '@/lib/stats/queries'
import { shortSeason } from '@/lib/stats/season-window'

// Rendered per request: a player who hides themselves must 404 at once (the data behind it is tag-cached and expires on a hide).
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** A visible player by slug. The visible list excludes hidden players, so a hidden slug is simply not found. */
async function findPlayer(slug: string) {
  const { players } = await getVisibleStatData()
  return [...players.values()].find((p) => p.slug === slug) ?? null
}

export async function generateMetadata({ params, searchParams }: Props) {
  const [club, { slug }, sp] = await Promise.all([getClub(), params, searchParams])
  const player = await findPlayer(slug)
  if (!player) return { title: titleWithSuffix(club, 'Player trends'), robots: { index: false, follow: false } }
  const filtered = first(sp.season) !== undefined || first(sp.vs) !== undefined
  return {
    title: titleWithSuffix(club, `${player.name}: trends`),
    description: `${player.name}'s innings, spells and seasons at ${club.name}, from the stored match data.`,
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor(insightsPaths.player(player.slug)) }),
    openGraph: baseOpenGraph(club),
  }
}

const cellText = (c: CompareCell) => ('label' in c ? c.label : c.why)

export default async function PlayerTrendsPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const player = await findPlayer(slug)
  if (!player) notFound()
  const [club, settings, mf] = await Promise.all([
    getClub(),
    getStatsSettings(),
    getPlayerMatchFacts(player.id).catch((err) => {
      console.warn('[insights] player match data unavailable:', (err as Error).message)
      return null
    }),
  ])
  const crumbs = breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Stats', href: '/stats' }, { name: 'Insights', href: insightsPaths.team }, { name: player.name, href: insightsPaths.player(player.slug) }], club)

  // Per-innings dates and opposition show only for games in the site's default categories. A player whose stored games are all in
  // other categories (for example junior) gets season totals only, with no dates and no opposition.
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  const shown = mf ? filterMatchFacts(mf.player, { cats, rules: settings.gradeRules }) : null
  const detail = !!shown && shown.appearances.length > 0
  const set = detail ? shown : (mf?.player ?? null)
  const gameCount = set ? new Set(set.appearances.map((a) => a.m)).size : 0

  const head = (
    <>
      <JsonLd data={crumbs} />
      <PageHeader eyebrow="Stats" title={`${player.name}: trends`} intro="Innings by innings and season by season, from the stored match data. Every figure shows how many innings or spells are behind it." />
    </>
  )
  if (!set || gameCount < INSIGHTS.minGames) {
    return (
      <main>
        {head}
        <section className="container-site space-y-6 py-12 lg:py-16">
          <StatsSubNav current={insightsPaths.team} />
          <EmptyState>Not enough games stored yet. A trend needs at least {INSIGHTS.minGames} stored games; {gameCount === 0 ? 'none are stored' : `${gameCount} ${gameCount === 1 ? 'is' : 'are'} stored`} for this player.</EmptyState>
          <p className="text-sm"><Link href={`/players/${player.slug}`} className="font-semibold text-brand-gold-deep underline underline-offset-2">Back to the profile</Link></p>
        </section>
      </main>
    )
  }

  const labels = buildLabelMap([...set.matches.values()].map((h) => ({ kind: 'grade' as const, label: h.grade })))
  const gradeLabel = (g: string | null) => (g ? canonicalGrade(g, labels) : null)
  const lines = seasonLines(set, player.id)
  const seasonNames = lines.map((l) => l.season)
  const latest = seasonNames[seasonNames.length - 1] ?? null
  const season = pickSeason(sp.season, seasonNames, latest)
  const vsDefault = season ? (seasonNames[seasonNames.indexOf(season) - 1] ?? null) : null
  const vs = pickSeason(sp.vs, seasonNames.filter((s) => s !== season), vsDefault)
  const a = lines.find((l) => l.season === season) ?? null
  const b = lines.find((l) => l.season === vs) ?? null
  const cmp = a && b ? compareSeasons(a, b, { innings: INSIGHTS.minInnings, balls: INSIGHTS.minBalls }) : null

  const bat = detail ? battingPoints(set, player.id, { gradeLabel }) : []
  const bowl = detail ? bowlingPoints(set, player.id, { gradeLabel }) : []
  const last = bat[bat.length - 1]
  const battingText = (p: (typeof bat)[number]) => `${p.runs}${p.status === 'not_out' ? '*' : p.status === 'unknown' ? '?' : ''}`
  const lineLabel = (p: { date: string | null; opp: string; grade: string | null }) => `${p.date ? formatCoverageDate(p.date) : 'No date'} v ${p.opp}${p.grade ? ` (${p.grade})` : ''}`

  const avgCell = (l: SeasonLine) =>
    l.usedInnings === 0 ? '–' : l.outs === 0 ? `not out (${l.runs} runs, ${l.usedInnings} inn)` : l.usedInnings < INSIGHTS.minInnings ? `n/a (${l.usedInnings} inn, needs ${INSIGHTS.minInnings})` : `${fmt(l.average)} (${l.usedInnings} inn)`
  const srCell = (l: SeasonLine) => (l.strikeRate === null ? (l.innings ? 'not recorded' : '–') : l.ballInnings < INSIGHTS.minInnings ? `n/a (${l.ballInnings} inn, needs ${INSIGHTS.minInnings})` : `${fmt(l.strikeRate)} (${l.ballInnings} inn)`)
  const ecoCell = (l: SeasonLine) => (l.economy === null ? (l.spells ? 'not recorded' : '–') : l.bowlBalls < INSIGHTS.minBalls ? `n/a (${l.economySpells} spells, needs ${Math.ceil(INSIGHTS.minBalls / 6)} overs)` : `${fmt(l.economy, 2)} (${l.economySpells} spells)`)

  return (
    <main>
      {head}
      <section className="container-site space-y-10 py-12 lg:py-16">
        <StatsSubNav current={insightsPaths.team} />
        <p className="text-sm text-brand-grey">
          {gameCount} stored games, senior grades only: junior games are not in the match data. Seasons are compared number against number: a figure goes up or down for many reasons, and a label is shown only when enough games are behind it.{' '}
          <Link href={`/players/${player.slug}`} className="font-semibold text-brand-gold-deep underline underline-offset-2">Back to the profile</Link>
        </p>
        {!detail && (
          <p className="rounded-xl bg-brand-stone p-4 text-sm text-brand-charcoal">All of this player&apos;s stored games are in grades that are not shown by default on the site, so only season totals are shown here, with no dates and no opposition.</p>
        )}

        {detail && (
          <div className="space-y-4">
            <SubHeading title="Batting" count={bat.length} />
            {bat.length === 0 ? (
              <EmptyState>No batting innings stored.</EmptyState>
            ) : bat.length < 2 ? (
              <EmptyState>Only 1 batting innings stored, not enough for a trend. That innings: {battingText(bat[0])}{bat[0].status === 'not_out' ? ' (not out)' : ''} against {bat[0].opp}.</EmptyState>
            ) : (
              <TrendChart
                idPrefix="ins-bat"
                title="Runs in each innings"
                takeaway={`${bat.length} innings. Latest: ${battingText(last)} against ${last.opp}${last.rolling === null ? '' : `. Rolling average of the last ${INSIGHTS.rollingInnings} innings: ${fmt(last.rolling)}`}.`}
                legend={`Bars: runs in each innings, oldest on the left. An outlined bar with a star is a not out innings; a question mark means the status was not recorded. Line: runs per dismissal over the last ${INSIGHTS.rollingInnings} innings, drawn only when that window holds ${INSIGHTS.minOuts} or more dismissals.`}
                input={{
                  labels: shortDates(bat.map((p) => p.date)),
                  bars: bat.map((p) => ({ value: p.runs, text: battingText(p), hollow: p.status === 'not_out' })),
                  line: bat.map((p) => p.rolling),
                  lineText: (v) => fmt(v),
                }}
                tableHead={['Innings', 'Runs', 'Balls', 'Rolling average']}
                tableRows={bat.map((p) => [lineLabel(p), `${battingText(p)}${p.status === 'not_out' ? ' not out' : ''}${p.duck ? ' (duck)' : ''}`, p.balls === null ? 'not recorded' : String(p.balls), p.rolling === null ? 'n/a' : fmt(p.rolling)])}
              />
            )}
          </div>
        )}

        {detail && bowl.length > 0 && (
          <div className="space-y-4">
            <SubHeading title="Bowling" count={bowl.length} />
            {bowl.length < 2 ? (
              <EmptyState>Only 1 bowling spell stored, not enough for a trend. That spell: {bowl[0].wickets} for {bowl[0].runs} against {bowl[0].opp}.</EmptyState>
            ) : (
              <TrendChart
                idPrefix="ins-bowl"
                title="Wickets in each spell"
                takeaway={`${bowl.length} spells. Latest: ${bowl[bowl.length - 1].wickets} for ${bowl[bowl.length - 1].runs} against ${bowl[bowl.length - 1].opp}.`}
                legend={`Bars: wickets in each spell, oldest on the left. Line: runs per over over the last ${INSIGHTS.rollingInnings} spells, drawn from ${INSIGHTS.minSpells} spells.`}
                input={{ labels: shortDates(bowl.map((p) => p.date)), bars: bowl.map((p) => ({ value: p.wickets, text: String(p.wickets) })), line: bowl.map((p) => p.rolling), lineText: (v) => fmt(v, 2) }}
                tableHead={['Spell', 'Figures', 'Rolling economy']}
                tableRows={bowl.map((p) => [lineLabel(p), `${p.wickets} for ${p.runs} (${Math.floor(p.balls / 6)}.${p.balls % 6} overs)`, p.rolling === null ? 'n/a' : fmt(p.rolling, 2)])}
              />
            )}
          </div>
        )}

        <div className="space-y-4">
          <SubHeading title="Season by season" count={lines.length} />
          <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Batting and bowling by season, with the number of innings or spells behind each figure.</caption>
              <thead className="text-brand-grey">
                <tr>
                  {['Season', 'Games', 'Innings', 'Runs', 'Average', 'Strike rate', 'Wickets', 'Economy'].map((h) => <th key={h} scope="col" className="px-3 py-3 font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.season} className="border-t border-brand-black/5">
                    <th scope="row" className="px-3 py-2.5 font-semibold text-brand-black">{shortSeason(l.season)}</th>
                    <td className="px-3 py-2.5 tabular-nums">{l.games}</td>
                    <td className="px-3 py-2.5 tabular-nums">{l.innings}</td>
                    <td className="px-3 py-2.5 tabular-nums">{l.innings ? l.runs : '–'}</td>
                    <td className="px-3 py-2.5">{avgCell(l)}</td>
                    <td className="px-3 py-2.5">{srCell(l)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{l.spells ? l.wickets : '–'}</td>
                    <td className="px-3 py-2.5">{ecoCell(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-brand-grey">
            An average is runs per dismissal and needs {INSIGHTS.minInnings} innings; with no dismissal it reads &ldquo;not out&rdquo;. An innings with no recorded status is left out of the average, so it can differ slightly from the average on the profile and the leaderboards, which count it as an out. Strike rate counts only innings with balls recorded; economy counts only spells with balls bowled and needs {Math.ceil(INSIGHTS.minBalls / 6)} overs.
          </p>
        </div>

        <div className="space-y-4">
          <SubHeading title="Compare seasons" />
          {lines.length < 2 ? (
            <EmptyState>Only {lines.length} {lines.length === 1 ? 'season' : 'seasons'} stored, not enough to compare.</EmptyState>
          ) : (
            <>
              <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                <div>
                  <label htmlFor="cmp-season" className="eyebrow">Season</label>
                  <select id="cmp-season" name="season" defaultValue={season ?? ''} className="mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black">
                    {[...seasonNames].reverse().map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="cmp-vs" className="eyebrow">Compare with</label>
                  <select id="cmp-vs" name="vs" defaultValue={vs ?? ''} className="mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black">
                    {[...seasonNames].reverse().filter((s) => s !== season).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <button type="submit" className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white hover:bg-brand-charcoal">Compare</button>
              </form>
              {a && b && cmp ? (
                <div className="overflow-x-auto rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <caption className="sr-only">{a.season} compared with {b.season}.</caption>
                    <thead className="text-brand-grey">
                      <tr>
                        <th scope="col" className="px-3 py-3 font-semibold">Figure</th>
                        <th scope="col" className="px-3 py-3 font-semibold">{shortSeason(a.season)}</th>
                        <th scope="col" className="px-3 py-3 font-semibold">{shortSeason(b.season)}</th>
                        <th scope="col" className="px-3 py-3 font-semibold">{shortSeason(a.season)} compared with {shortSeason(b.season)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['Batting average', avgCell(a), avgCell(b), cmp.average],
                        ['Strike rate', srCell(a), srCell(b), cmp.strikeRate],
                        ['Economy', ecoCell(a), ecoCell(b), cmp.economy],
                      ] as const).map(([label, x, y, c]) => (
                        <tr key={label} className="border-t border-brand-black/5">
                          <th scope="row" className="px-3 py-2.5 font-semibold text-brand-black">{label}</th>
                          <td className="px-3 py-2.5">{x}</td>
                          <td className="px-3 py-2.5">{y}</td>
                          <td className="px-3 py-2.5 font-semibold text-brand-black">{cellText(c)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState>Choose two seasons to compare.</EmptyState>
              )}
              <p className="text-xs text-brand-grey">
                A direction (higher, lower, about the same) is shown only when both seasons meet the minimum above and the two figures differ by more than {Math.round(INSIGHTS.compareShare * 100)}% of the figure they are compared with. It compares two numbers; it does not say why they differ or what comes next.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
