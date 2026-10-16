import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { LeaderboardTable } from '@/components/votes/leaderboard-table'
import { RaceChart } from '@/components/votes/race-chart'
import { VOTES, votePaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { canonicalFor, titleWithSuffix } from '@/lib/site-metadata'
import { getCachedPublicBoard, getCachedPublicOptions } from '@/lib/votes-queries'
import { buildRace } from '@/lib/votes/chart'
import { ballotValuesLabel } from '@/lib/votes/settings'
import { cn } from '@/lib/utils'

// Rendered per request (it reads searchParams), but the data behind it is cached for a few minutes under the `votes-public` tag, which
// the vote settings expire: switching the board off is a plain 404 at once, and a cast vote shows after the cache window.

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams
  const club = await getClub()
  const filtered = one(sp.grade) !== '' || one(sp.season) !== ''
  return {
    title: titleWithSuffix(club, `${VOTES.label} leaderboard`),
    description: `${VOTES.label} votes for the season, by points.`,
    ...(filtered ? { robots: { index: false, follow: true } } : { alternates: canonicalFor(votePaths.publicBoard) }),
  }
}

const pill = (active: boolean) =>
  cn('inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition', active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60')

/**
 * The public best-player leaderboard. A plain 404 unless the committee has switched voting AND the public leaderboard on. It shows
 * season totals of games whose voting has closed, never who voted for whom and never a single game's result.
 */
export default async function VotesPage({ searchParams }: Props) {
  const sp = await searchParams
  const club = await getClub()
  const options = await getCachedPublicOptions()
  if (!options) notFound()
  const seasonRaw = one(sp.season)
  const gradeRaw = one(sp.grade)
  // Only values the page really offers reach the board, so arbitrary query strings cannot build or cache anything.
  const season = /^\d{4}$/.test(seasonRaw) && options.seasons.includes(Number(seasonRaw)) ? Number(seasonRaw) : null
  if (gradeRaw && !options.gradeIds.includes(gradeRaw)) notFound()
  if (!gradeRaw && options.scope === 'grade') {
    // Grade-only scope has no whole-club board: send visitors to the first grade rather than a dead end.
    const first = options.gradeIds[0]
    if (first) redirect(`${votePaths.publicBoard}?${new URLSearchParams({ grade: first })}`)
    notFound()
  }
  const board = await getCachedPublicBoard(season, gradeRaw || null, club.locale)
  if (!board) notFound()
  const { settings, result } = board
  const href = (grade: string | null, season: number) => `${votePaths.publicBoard}?${new URLSearchParams({ ...(grade ? { grade } : {}), ...(season !== board.seasons[0] ? { season: String(season) } : {}) })}`.replace(/\?$/, '')
  const showGrades = settings.publicScope !== 'club' && board.grades.length > 0
  const showClub = settings.publicScope !== 'grade'
  const seasonLabel = `${board.scope.season}/${String(board.scope.season + 1).slice(2)}`
  return (
    <main>
      <PageHeader eyebrow="Stats" title={`${VOTES.label} leaderboard`} intro={`Season ${seasonLabel}. Points ${ballotValuesLabel(settings.ballotValues)} from player votes after each game.`} />
      <section className="container-site space-y-10 py-10 lg:py-14">
        <StatsSubNav current={votePaths.publicBoard} />
        {(showGrades || board.seasons.length > 1) && (
          <div className="space-y-3">
            {showGrades && (
              <nav aria-label="Leaderboard scope" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <ul className="flex w-max gap-2">
                  {showClub && <li><Link href={href(null, board.scope.season)} aria-current={!board.scope.gradeId ? 'page' : undefined} className={pill(!board.scope.gradeId)}>Whole club</Link></li>}
                  {board.grades.map((g) => <li key={g.gradeId}><Link href={href(g.gradeId, board.scope.season)} aria-current={board.scope.gradeId === g.gradeId ? 'page' : undefined} className={pill(board.scope.gradeId === g.gradeId)}>{g.gradeName}</Link></li>)}
                </ul>
              </nav>
            )}
            {board.seasons.length > 1 && (
              <nav aria-label="Season" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <ul className="flex w-max gap-2">
                  {board.seasons.map((y) => <li key={y}><Link href={href(board.scope.gradeId, y)} aria-current={y === board.scope.season ? 'page' : undefined} className={pill(y === board.scope.season)}>{y}/{String(y + 1).slice(2)}</Link></li>)}
                </ul>
              </nav>
            )}
          </div>
        )}
        <LeaderboardTable rows={result.rows} values={settings.ballotValues} breakdown={settings.publicShowBreakdown} caption={`${board.gradeName ?? 'Whole club'} ${VOTES.label.toLowerCase()} leaderboard, season ${seasonLabel}`} empty={<p className="rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">No games have been counted yet. Totals appear once a round&rsquo;s voting has closed.</p>} />
        <p className="text-sm text-brand-grey">
          {result.uncountedGames > 0 ? `${result.uncountedGames} ${result.uncountedGames === 1 ? 'game is' : 'games are'} not counted yet. ` : ''}
          {result.countedGames} {result.countedGames === 1 ? 'game is' : 'games are'} in these totals. A game counts once at least {settings.minBallotsToCount} players have voted and its voting has closed. Games is how many counted games the player was in.
        </p>
        {result.boards.length > 1 && <RaceChart data={buildRace(result.boards)} labels={board.roundLabels} idPrefix="public-race" caption="Top players, points after each weekend" />}
        <p className="text-xs text-brand-grey">Votes are anonymous at normal club sizes. Only totals are shown, never who voted for whom.</p>
      </section>
    </main>
  )
}
