import { Suspense } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ExternalLinkIcon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { SeasonPicker } from '@/components/playhq/season-picker'
import { TeamFilter } from '@/components/playhq/team-filter'
import { GameCard } from '@/components/playhq/game-card'
import { PlayHQUnavailable } from '@/components/playhq/playhq-unavailable'
import { resolveSeason, getClubGames, resultSentence, sortUpcoming, sortResults, isFinished } from '@/lib/playhq'
import { PLAYHQ_CLUB_URL } from '@/lib/playhq/format'

export const revalidate = 1800

export const metadata = {
  title: 'Fixtures & Results | Lang Lang Cricket Club',
}

type Props = { searchParams: { season?: string; team?: string } }

function ColumnHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="display text-3xl text-brand-black sm:text-4xl">{title}</h2>
      <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
        {count}
      </span>
      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <li className="rounded-2xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">{children}</li>
}

function PlayHQLink({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={PLAYHQ_CLUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black"
    >
      {children}
    </a>
  )
}

export default async function FixturesPage({ searchParams }: Props) {
  let content: React.ReactNode
  try {
    const { groups, season } = await resolveSeason(searchParams.season)
    if (!season) throw new Error('no seasons')
    const { teams, games } = await getClubGames(season)
    const teamId = searchParams.team && teams.some((t) => t.id === searchParams.team) ? searchParams.team : null
    const filtered = teamId ? games.filter((g) => g.club.id === teamId || g.opponent.id === teamId) : games
    const upcoming = sortUpcoming(filtered.filter((g) => !isFinished(g)))
    const results = sortResults(filtered.filter(isFinished))

    content = (
      <>
        <section className="border-b border-brand-black/10 bg-brand-cream">
          <div className="container-site flex flex-col gap-6 py-8 lg:flex-row lg:items-start lg:gap-12">
            <Suspense fallback={<div className="min-h-11" aria-hidden />}>
              <SeasonPicker groups={groups} current={season.name} basePath="/fixtures" />
            </Suspense>
            {teams.length > 0 && <TeamFilter teams={teams} current={teamId} season={season.name} basePath="/fixtures" />}
          </div>
        </section>

        <section className="container-site grid gap-16 py-16 lg:grid-cols-2 lg:gap-12 lg:py-24">
          <div>
            <ColumnHeading title="Upcoming" count={upcoming.length} />
            <ul className="mt-8 space-y-4">
              {upcoming.map((g) => (
                <li key={g.id}>
                  <GameCard game={g} variant="upcoming" showTeam />
                </li>
              ))}
              {upcoming.length === 0 && (
                <EmptyState>
                  No upcoming fixtures for this season yet. <PlayHQLink>Check PlayHQ for the latest draw.</PlayHQLink>
                </EmptyState>
              )}
            </ul>
          </div>

          <div>
            <ColumnHeading title="Results" count={results.length} />
            <ul className="mt-8 space-y-4">
              {results.map((g) => (
                <li key={g.id}>
                  <GameCard game={g} variant="result" resultText={resultSentence(g)} showTeam />
                </li>
              ))}
              {results.length === 0 && (
                <EmptyState>
                  No results yet this season. <PlayHQLink>See past results and scorecards on PlayHQ.</PlayHQLink>
                </EmptyState>
              )}
            </ul>
          </div>
        </section>
      </>
    )
  } catch (err) {
    console.error('[playhq] fixtures page', err)
    content = (
      <section className="container-site py-16">
        <PlayHQUnavailable what="fixtures and results" />
      </section>
    )
  }

  return (
    <main>
      <PageHeader
        eyebrow="Fixtures & results"
        title="This season's matches"
        intro="Live draw and results for every Lang Lang side, straight from PlayHQ."
      >
        <a
          href={PLAYHQ_CLUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
        >
          Full fixtures, ladders, results &amp; scorecards on PlayHQ
          <HugeiconsIcon icon={ExternalLinkIcon} className="h-4 w-4" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </PageHeader>
      {content}
    </main>
  )
}
