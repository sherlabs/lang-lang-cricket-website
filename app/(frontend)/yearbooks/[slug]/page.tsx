import { notFound } from 'next/navigation'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { JsonLd } from '@/components/json-ld'
import { PageHeader } from '@/components/page-header'
import { PlayHQUnavailable } from '@/components/playhq/playhq-unavailable'
import { YearbookHighlights, YearbookMatchResults, YearbookPartnerships, YearbookProgression, highlightLines } from '@/components/stats/match/yearbook-match-sections'
import { LeaderboardTable, type LeaderboardRow } from '@/components/stats/leaderboard-table'
import { PrintButton } from '@/components/stats/print-button'
import { SubHeading } from '@/components/stats/sub-heading'
import {
  YearbookHonours,
  YearbookMessages,
  YearbookOverview,
  YearbookPhotos,
  YearbookResults,
  YearbookSponsors,
} from '@/components/stats/yearbook-sections'
import { getClub } from '@/lib/club'
import { getYearbookMatchData } from '@/lib/match-store/yearbook-queries'
import { loadGamesForSeasonName } from '@/lib/matches-queries'
import { getStatsSettings } from '@/lib/site-settings'
import { baseOpenGraph, canonicalFor, titleWithSuffix, truncateDescription } from '@/lib/site-metadata'
import { mergeBySeason } from '@/lib/stats/aggregate'
import { boardContext, buildLeaderboard, filterRows } from '@/lib/stats/leaderboard'
import { getMetric } from '@/lib/stats/metrics'
import { qualifierText } from '@/lib/stats/qualify'
import { buildLabelMap, canonicalGrade } from '@/lib/stats/labels'
import { coverageCaption, coverageOf } from '@/lib/stats/match/coverage'
import { buildMatchRecords, partnershipCoverageText, partnershipRecordsByWicket, partnershipTop } from '@/lib/stats/match/records'
import { matchAllRounders, progressionByGrade, resultsByGradeFromLines, shareText, storedShare } from '@/lib/stats/match/yearbook'
import { effectiveCategories } from '@/lib/stats/query-string'
import { getHonourPlayers, getVisibleStatData } from '@/lib/stats/queries'
import { ALLROUNDER_FORMULA, honoursForSeason, resultsByGrade, summariseResults, topAllRounders } from '@/lib/stats/yearbook'
import { breadcrumbJsonLd, yearbookJsonLd } from '@/lib/structured-data'
import { getPublishedYearbookBySlug, getPublishedYearbookMeta } from '@/lib/yearbooks-queries'

// Same rendering mode as every stats route (ISR, 900s). A publish/unpublish revalidates this path
// (Yearbooks hooks), and a draft is a 404 because every query states `status = published`.
export const revalidate = 900

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const [club, book] = await Promise.all([getClub(), getPublishedYearbookMeta(slug)])
  if (!book) return { title: 'Yearbook not found', robots: { index: false } }
  const og = baseOpenGraph(club)
  return {
    alternates: canonicalFor(`/yearbooks/${book.slug}`),
    title: titleWithSuffix(club, book.title),
    description: truncateDescription(`${book.title}: messages, the stats leaders, results and photos from ${book.seasonName} at ${club.name}.${book.premiership ? ` ${book.premiership}.` : ''}`),
    openGraph: { ...og, type: 'article', images: book.coverUrl ? [{ url: book.coverUrl, alt: book.title }] : og.images },
  }
}

const TOP = 5
const BOARDS = [
  { metric: 'runs', title: 'Top batters' },
  { metric: 'wickets', title: 'Top bowlers' },
  { metric: 'catches', title: 'Top fielders' },
  { metric: 'games', title: 'Most games' },
] as const

export default async function YearbookPage({ params }: Props) {
  const { slug } = await params
  const book = await getPublishedYearbookBySlug(slug)
  if (!book) notFound()

  const [club, settings, data, honourPlayers, results] = await Promise.all([
    getClub(),
    getStatsSettings(),
    getVisibleStatData(),
    getHonourPlayers(),
    loadGamesForSeasonName(book.seasonName),
  ])
  const copy = club.pageCopy.yearbooks
  // The same categories and the same builder as /stats?season=..., so the numbers cannot differ.
  const cats = effectiveCategories({ cats: null, juniors: false }, settings.defaultIncludedCategories)
  // Match-data sections (W2 spec 5.5): only when the season has stored matches; otherwise the page is as before.
  const match = await getYearbookMatchData(book.seasonName, { cats, rules: settings.gradeRules })
  const hasMatches = !!match && match.lines.length > 0
  const share = hasMatches ? storedShare(match.lines, results.status === 'ok' ? results.games : null, { cats, rules: settings.gradeRules }) : null
  const storedResults = hasMatches && share?.complete === true
  const labels = hasMatches ? buildLabelMap(match.lines.map((l) => ({ kind: 'grade' as const, label: l.grade }))) : null
  const gradeLabel = (g: string | null) => (g && labels ? canonicalGrade(g, labels) : g)
  const matchCaption = hasMatches && share ? `${coverageCaption(coverageOf(match.set))} ${shareText(share)}` : ''
  const names = new Map([...data.players].map(([id, p]) => [id, { name: p.name, slug: p.slug as string | null }]))
  const records = hasMatches && match.set.matches.size > 0 ? buildMatchRecords(match.set, settings.matchMinimums, gradeLabel) : null
  const hasStats = data.rows.some((r) => r.seasonName === book.seasonName)

  const boards = hasStats
    ? BOARDS.map((b) => {
        const metric = getMetric(b.metric)!
        const lb = buildLeaderboard(data.rows, { season: book.seasonName, grade: 'all', metric: b.metric }, cats, settings)
        const ctx = boardContext(metric)
        const rows: LeaderboardRow[] = lb.result.ranked.filter((r) => r.rank <= TOP).slice(0, TOP * 2).flatMap((r) => {
          const p = data.players.get(r.item.playerId)
          return p ? [{ key: r.item.playerId, rank: r.rank, name: p.name, slug: p.slug, value: r.display, context: ctx.text(r.item.counts) }] : []
        })
        return { ...b, metric, ctx, rows, note: qualifierText(metric.qualifier, settings.qualification.season) }
      })
    : []
  const allRounders = hasStats
    ? topAllRounders(mergeBySeason(filterRows(data.rows, { cats, rules: settings.gradeRules, season: book.seasonName })))
        .flatMap((r) => {
          const p = data.players.get(r.item.playerId)
          return p ? [{ key: r.item.playerId, rank: r.rank, name: p.name, slug: p.slug, value: String(r.value), context: `${r.item.counts.batRuns} / ${r.item.counts.bowlWickets}` }] : []
        })
    : []
  const honours = honoursForSeason(honourPlayers, book.seasonName)

  return (
    <main className="yearbook-print">
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', href: '/' }, { name: 'Yearbooks', href: '/yearbooks' }, { name: book.title, href: `/yearbooks/${book.slug}` }], club)} />
      <JsonLd data={yearbookJsonLd(book, club)} />
      <div className="print-banner">
        <PageHeader eyebrow={`${book.seasonName}${book.premiership ? ` · ${book.premiership}` : ''}`} title={book.title}>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/yearbooks"
              className="print-hide mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
              All yearbooks
            </Link>
            <PrintButton label={copy.printLabel} />
          </div>
        </PageHeader>
      </div>

      <div className="container-site space-y-14 py-12 lg:py-16">
        {book.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverUrl} alt="" className="print-section aspect-[2/1] w-full rounded-2xl object-cover shadow-card" />
        )}

        <YearbookMessages
          items={[
            { title: "President's message", text: book.presidentMessage },
            { title: "Coach's message", text: book.coachMessage },
            { title: 'Our sponsors', text: book.sponsorMessage },
          ]}
        />

        {results.status === 'ok' && <YearbookOverview summary={summariseResults(results.games)} />}

        {hasStats && (
          <section aria-labelledby="yb-stats" className="print-section space-y-6">
            <SubHeading id="yb-stats" title={copy.statsHeading} />
            <p className="text-sm text-brand-grey">
              Single-season figures for {book.seasonName}, teams combined.
              Batting average and economy leaders are on the <Link href={`/stats?season=${encodeURIComponent(book.seasonName)}`} className="font-semibold text-brand-gold-deep underline underline-offset-2">stats page</Link>.
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              {boards.map((b) => (
                <LeaderboardTable key={b.metric.key} title={b.title} caption={`${b.title}, ${book.seasonName}. Ties share a rank.`} valueLabel={b.metric.short} contextLabel={b.ctx.label} rows={b.rows} />
              ))}
              {allRounders.length > 0 && (
                <LeaderboardTable
                  title="Top all-rounders, from season totals"
                  caption={`Top all-rounders from season totals, ${book.seasonName}. Ranked by ${ALLROUNDER_FORMULA}. Ties share a rank.`}
                  valueLabel="Score"
                  contextLabel="Runs / wkts"
                  rows={allRounders}
                  footer={<p className="px-3 pb-3 pt-1 text-sm text-brand-grey">Ranked by {ALLROUNDER_FORMULA}. A stat ranking, not an award.</p>}
                />
              )}
            </div>
          </section>
        )}

        {storedResults && match && <YearbookMatchResults byGrade={resultsByGradeFromLines(match.lines, gradeLabel)} caption={matchCaption} />}
        {!storedResults && results.status === 'ok' && (
          <YearbookResults
            byGrade={resultsByGrade(results.games)}
            season={book.seasonName}
            source={`Results from the fixtures list.${hasMatches && share ? ` Scores from stored scorecards are used only when every finished game is stored. ${shareText(share)}` : ''}`}
          />
        )}
        {!storedResults && results.status === 'unavailable' && (
          <section className="print-section space-y-6">
            <SubHeading title="Results" />
            <PlayHQUnavailable what="results" />
          </section>
        )}

        {hasMatches && match && (
          <>
            <YearbookProgression items={progressionByGrade(match.lines, gradeLabel)} caption={matchCaption} />
            {records && (
              <YearbookPartnerships
                byWicket={partnershipRecordsByWicket(match.set)}
                top={partnershipTop(match.set, 5).slice(0, 5)}
                names={names}
                caption={matchCaption}
                note={partnershipCoverageText(match.set)}
              />
            )}
            {records && (
              <YearbookHighlights
                lines={highlightLines(records)}
                partnership={partnershipTop(match.set, 1)[0] ?? null}
                allRounders={storedResults ? matchAllRounders(match.set).flatMap((r) => {
                  const p = data.players.get(r.playerId)
                  return p ? [{ key: r.playerId, rank: r.rank, name: p.name, slug: p.slug, value: String(r.score), context: `${r.runs} / ${r.wickets}` }] : []
                }) : []}
                names={names}
                caption={matchCaption}
              />
            )}
          </>
        )}

        <YearbookHonours items={honours} />
        <YearbookPhotos photos={book.photos} title={book.title} />
        <YearbookSponsors sponsors={book.sponsors} />
      </div>
    </main>
  )
}
