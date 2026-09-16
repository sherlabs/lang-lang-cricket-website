import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { SectionHeading } from '@/components/section-heading'
import { GameCard } from '@/components/playhq/game-card'
import { LadderTable } from '@/components/playhq/ladder-table'
import { PlayerStatsTables } from '@/components/playhq/player-stats-tables'
import { seasonHref } from '@/lib/playhq/format'
import { findClubTeam, getClubTeams, getTeamGames, getLadder, getTeamPlayerStats, isFinished, resultSentence, sortResults, sortUpcoming } from '@/lib/playhq'

export const revalidate = 1800

type Props = { params: { teamId: string }; searchParams: { season?: string } }

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const found = await findClubTeam(params.teamId, searchParams.season).catch(() => null)
  const name = found?.team.name ?? 'Team'
  return { title: `${name} | Lang Lang Cricket Club` }
}

function ColumnHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <h3 className="display text-2xl text-brand-black sm:text-3xl">{title}</h3>
      <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
        {count}
      </span>
      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">{children}</p>
}

export default async function TeamPage({ params, searchParams }: Props) {
  const { season: seasonHint } = searchParams
  const found = await findClubTeam(params.teamId, seasonHint)
  if (!found) notFound()
  const { team, season } = found

  const teams = await getClubTeams(season)
  const ids = new Set(teams.map((t) => t.id))
  const games = await getTeamGames(team, ids)
  const [ladder, players] = await Promise.all([
    team.gradeId ? getLadder(team.gradeId, ids).catch(() => null) : Promise.resolve(null),
    getTeamPlayerStats(team, games).catch(() => null),
  ])

  const upcoming = sortUpcoming(games.filter((g) => !isFinished(g)))
  const results = sortResults(games.filter(isFinished))
  const showPlayers = players && players.gamesCounted > 0 && players.stats.length > 0

  return (
    <main>
      <PageHeader eyebrow={`${team.seasonName} · ${team.gradeName ?? team.competitionName}`} title={team.name}>
        <Link
          href={seasonHref('/teams', team.seasonName)}
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          All teams
        </Link>
      </PageHeader>

      <section className="container-site py-16 lg:py-24">
        <SectionHeading eyebrow="Standings" title="Ladder" />
        <div className="mt-8">
          {ladder ? (
            <LadderTable ladder={ladder} />
          ) : (
            <Note>
              {team.gradeId
                ? 'The ladder is not available right now.'
                : 'This team has not been allocated to a grade yet.'}
            </Note>
          )}
        </div>
      </section>

      <section className="border-t border-brand-black/10 bg-brand-cream">
        <div className="container-site py-16 lg:py-24">
          <SectionHeading eyebrow="Season" title="Fixtures & results" />
          <div className="mt-10 grid gap-12 lg:grid-cols-2">
            <div>
              <ColumnHeading title="Upcoming" count={upcoming.length} />
              <ul className="mt-6 space-y-4">
                {upcoming.map((g) => (
                  <li key={g.id}>
                    <GameCard game={g} variant="upcoming" showTeam={false} />
                  </li>
                ))}
                {upcoming.length === 0 && <li><Note>No upcoming fixtures.</Note></li>}
              </ul>
            </div>
            <div>
              <ColumnHeading title="Results" count={results.length} />
              <ul className="mt-6 space-y-4">
                {results.map((g) => (
                  <li key={g.id}>
                    <GameCard game={g} variant="result" resultText={resultSentence(g)} showTeam={false} season={team.seasonName} />
                  </li>
                ))}
                {results.length === 0 && <li><Note>No results yet.</Note></li>}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="container-site py-16 lg:py-24">
        <SectionHeading eyebrow="Squad" title="Players" />
        <div className="mt-8">
          {showPlayers ? (
            <PlayerStatsTables stats={players.stats} gamesCounted={players.gamesCounted} />
          ) : (
            <Note>Player stats will appear after the first completed match.</Note>
          )}
        </div>
      </section>
    </main>
  )
}
