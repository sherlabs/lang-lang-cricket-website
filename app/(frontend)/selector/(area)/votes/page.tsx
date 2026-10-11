import type { Metadata } from 'next'
import Link from 'next/link'
import { LeaderboardTable } from '@/components/votes/leaderboard-table'
import { RaceChart } from '@/components/votes/race-chart'
import { btnQuiet } from '@/components/selector/styles'
import { VOTES, votePaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { formatMatchDay } from '@/lib/selection/lineup-text'
import { loadPrivateBoard, loadVotesHome, type VoteGameRow } from '@/lib/selector-votes-queries'
import { buildRace } from '@/lib/votes/chart'
import { ballotValuesLabel } from '@/lib/votes/settings'

export const metadata: Metadata = { title: `${VOTES.label} votes`, robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ grade?: string; season?: string }> }

const state = (g: VoteGameRow): string => (!g.countsForAwards ? 'Not counted (excluded)' : g.status === 'open' ? 'Voting open' : g.status === 'closed' ? 'Voting closed' : 'Waiting for the result')

/** Games needing votes, who has voted, and the private leaderboard (selectors and the committee). */
export default async function VotesHome({ searchParams }: Props) {
  const user = await requireSelection(votePaths.selector)
  const sp = await searchParams
  const { locale } = await getClub()
  const home = await loadVotesHome(user)
  const season = typeof sp.season === 'string' && /^\d{4}$/.test(sp.season) ? Number(sp.season) : null
  const { board, seasons } = await loadPrivateBoard(user, { season, gradeId: typeof sp.grade === 'string' ? sp.grade : null, locale })
  const q = (grade: string | null) => `${votePaths.selector}?${new URLSearchParams({ ...(grade ? { grade } : {}), ...(season ? { season: String(season) } : {}) }).toString()}`
  const csv = `/api/admin/votes-export?${new URLSearchParams({ ...(board.scope.gradeId ? { grade: board.scope.gradeId } : {}), season: String(board.scope.season) }).toString()}`
  return (
    <main className="container-site max-w-4xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black sm:text-4xl">{VOTES.label} votes</h1>
      <div className="mt-3 flex flex-wrap gap-3">
        <Link href={votePaths.present} className={btnQuiet}>Awards night mode</Link>
        <Link href={votePaths.settings} className={btnQuiet}>{home.isStaff ? 'Settings' : 'View settings'}</Link>
        {home.isAdmin && <a href={csv} className={btnQuiet}>Download totals (CSV)</a>}
        {home.settings.enabled && home.settings.publicLeaderboard && <Link href={votePaths.publicBoard} className={btnQuiet}>Public leaderboard</Link>}
      </div>
      {!home.settings.enabled && (
        <p role="status" className="mt-4 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">
          Voting is switched off, so players cannot vote and nothing is shown on the site.{home.isStaff ? ' Switch it on in Settings.' : ' A committee member can switch it on.'}
        </p>
      )}

      <section aria-labelledby="games" className="mt-8">
        <h2 id="games" className="text-xl font-bold text-brand-black">Games</h2>
        {home.games.length === 0 ? (
          <p className="mt-3 rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">No finished games are stored yet. They appear here after PlayHQ marks a game final and fixtures are refreshed.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {home.games.map((g) => (
              <li key={g.id}>
                <Link href={votePaths.fixture(g.id)} className="block min-h-11 rounded-xl bg-white p-4 ring-1 ring-brand-black/10 hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
                  <span className="block text-base font-bold text-brand-black">{g.gradeName} v {g.opponentName}</span>
                  <span className="mt-1 block text-sm text-brand-grey">{formatMatchDay(g.localDate, locale)}{g.roundName ? `, ${g.roundName}` : ''}</span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-black">
                    <span>{state(g)}</span>
                    <span>{g.voted} of {g.eligible} voted{g.enteredBySelector ? `, ${g.enteredBySelector} entered by a selector` : ''}</span>
                    <span>{g.counts ? 'Counts' : `${g.voted + g.enteredBySelector} of ${g.needed} votes needed to count`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="board" className="mt-10">
        <h2 id="board" className="text-xl font-bold text-brand-black">Leaderboard (private)</h2>
        <p className="mt-1 text-sm text-brand-grey">This includes games whose voting is still open. It is not what the public sees. Points {ballotValuesLabel(board.settings.ballotValues)}.</p>
        <nav aria-label="Leaderboard scope" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: null as string | null, name: 'Whole club' }, ...board.grades.map((g) => ({ id: g.gradeId as string | null, name: g.gradeName }))].map((t) => (
            <Link key={t.id ?? 'club'} href={q(t.id)} aria-current={(board.scope.gradeId ?? null) === t.id ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold ${(board.scope.gradeId ?? null) === t.id ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>{t.name}</Link>
          ))}
        </nav>
        {seasons.length > 1 && (
          <p className="mt-2 text-sm text-brand-grey">
            Season:{' '}
            {seasons.map((y) => <Link key={y} href={`${votePaths.selector}?${new URLSearchParams({ ...(board.scope.gradeId ? { grade: board.scope.gradeId } : {}), season: String(y) })}`} className={`mr-3 underline underline-offset-4 ${y === board.scope.season ? 'font-bold text-brand-black' : ''}`}>{y}/{String(y + 1).slice(2)}</Link>)}
          </p>
        )}
        <div className="mt-3">
          <LeaderboardTable rows={board.result.rows} values={board.settings.ballotValues} breakdown caption={`${board.gradeName ?? 'Whole club'} ${VOTES.label.toLowerCase()} leaderboard`} />
        </div>
        {board.result.uncountedGames > 0 && <p className="mt-2 text-sm text-brand-grey">{board.result.uncountedGames} {board.result.uncountedGames === 1 ? 'game is' : 'games are'} not counted yet (fewer than {board.settings.minBallotsToCount} votes).</p>}
        {board.result.boards.length > 1 && (
          <div className="mt-6">
            <RaceChart data={buildRace(board.result.boards)} labels={board.roundLabels} idPrefix="private-race" caption="Top players, points after each weekend" />
          </div>
        )}
      </section>
    </main>
  )
}
