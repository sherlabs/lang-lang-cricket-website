import { Suspense } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowLeft01Icon, ExternalLinkIcon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { SeasonPicker } from '@/components/playhq/season-picker'
import { GameRows } from '@/components/playhq/game-rows'
import { TeamGrid } from '@/components/playhq/team-grid'
import { TeamSwitcher } from '@/components/playhq/team-switcher'
import { LadderTable } from '@/components/playhq/ladder-table'
import { PlayerStatsTables } from '@/components/playhq/player-stats-tables'
import { PlayHQUnavailable } from '@/components/playhq/playhq-unavailable'
import { resolveSeason, getClubGames, getLadder, getTeamPlayerStats, isFinished, mapLimit, sortResults, sortUpcoming } from '@/lib/playhq'
import { todayMelbourne } from '@/lib/playhq/games'
import { groupByDate, latestResultsWindow, nextRoundWindow } from '@/lib/playhq/rounds'
import type { ClubTeam, Game, Ladder, SeasonGroup } from '@/lib/playhq/types'
import { formatLocalDate, PLAYHQ_CLUB_URL, seasonHref } from '@/lib/playhq/format'

export const revalidate = 1800

export const metadata = {
  title: 'Fixtures, Results & Teams | Lang Lang Cricket Club',
}

type Props = { searchParams: { season?: string; team?: string } }

// ---- small building blocks ----

function HubHeading({ title, count, id }: { title: string; count?: number; id: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 id={id} className="display text-3xl text-brand-black">{title}</h2>
      {count != null && (
        <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">{count}</span>
      )}
      <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-brand-stone px-6 py-5 text-sm text-brand-grey-light">{children}</p>
}

function PlayHQLink({ children }: { children: React.ReactNode }) {
  return (
    <a href={PLAYHQ_CLUB_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-gold-deep underline underline-offset-2 hover:text-brand-black">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  )
}

function DateHeading({ date }: { date: string | null }) {
  return <h3 className="mb-1 mt-5 text-sm font-bold text-brand-charcoal first:mt-0">{date ? formatLocalDate(date) : 'Date to be confirmed'}</h3>
}

/** Rows grouped under a date heading. `variant` decides the columns. */
function GroupedRows({ games, variant, season, showTeam }: { games: Game[]; variant: 'upcoming' | 'result'; season: string; showTeam: boolean }) {
  return (
    <>
      {groupByDate(games).map((grp) => (
        <div key={grp.date ?? 'tbc'}>
          <DateHeading date={grp.date} />
          <div className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
            <GameRows games={grp.games} variant={variant} season={season} showTeam={showTeam} caption={grp.date ? formatLocalDate(grp.date) : 'Date to be confirmed'} />
          </div>
        </div>
      ))}
    </>
  )
}

/** Native disclosure — no client JS. */
function Disclosure({ summary, open, children }: { summary: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group mt-4">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-gold-deep hover:text-brand-black [&::-webkit-details-marker]:hidden">
        <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}

function ExternalCta() {
  return (
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
  )
}

function SeasonBar({ groups, season }: { groups: SeasonGroup[]; season: string }) {
  return (
    <section className="border-b border-brand-black/10 bg-brand-cream">
      <div className="container-site py-6">
        <Suspense fallback={<div className="min-h-11" aria-hidden />}>
          <SeasonPicker groups={groups} current={season} basePath="/fixtures" />
        </Suspense>
      </div>
    </section>
  )
}

// ---- default (club-wide) view ----

async function loadLadders(teams: ClubTeam[]) {
  const ids = new Set(teams.map((t) => t.id))
  const gradeIds = [...new Set(teams.map((t) => t.gradeId).filter((g): g is string => !!g))]
  const list = await mapLimit(gradeIds, 5, (g) => getLadder(g, ids).catch(() => null))
  return new Map<string, Ladder | null>(gradeIds.map((g, i) => [g, list[i]]))
}

async function HubView({ season, teams, games }: { season: string; teams: ClubTeam[]; games: Game[] }) {
  const today = todayMelbourne()
  const nextUp = nextRoundWindow(games, today)
  const remaining = sortUpcoming(games.filter((g) => !isFinished(g) && (g.localDate ?? '9999-12-31') >= today))
  const latest = latestResultsWindow(games, today)
  const results = sortResults(games.filter(isFinished))
  const ladders = await loadLadders(teams)

  return (
    <div className="container-site space-y-14 py-12 lg:py-16">
      <section aria-labelledby="next-up">
        <HubHeading id="next-up" title="Next up" count={nextUp.length} />
        <div className="mt-5">
          {nextUp.length ? (
            <GroupedRows games={nextUp} variant="upcoming" season={season} showTeam />
          ) : (
            <Note>
              No upcoming fixtures — check back when the draw is released. <PlayHQLink>See the club on PlayHQ.</PlayHQLink>
            </Note>
          )}
          {remaining.length > nextUp.length && (
            <Disclosure summary={`Full draw (${remaining.length} remaining fixtures)`}>
              <GroupedRows games={remaining} variant="upcoming" season={season} showTeam />
            </Disclosure>
          )}
        </div>
      </section>

      <section aria-labelledby="latest-results">
        <HubHeading id="latest-results" title="Latest results" count={latest.length} />
        <div className="mt-5">
          {latest.length ? (
            <GroupedRows games={latest} variant="result" season={season} showTeam />
          ) : (
            <Note>
              No results yet this season. <PlayHQLink>See past results and scorecards on PlayHQ.</PlayHQLink>
            </Note>
          )}
          {results.length > latest.length && (
            <Disclosure summary={`All results this season (${results.length})`}>
              <GroupedRows games={results} variant="result" season={season} showTeam />
            </Disclosure>
          )}
        </div>
      </section>

      <section aria-labelledby="our-teams">
        <HubHeading id="our-teams" title="Our teams" count={teams.length} />
        <div className="mt-5 space-y-8">
          {teams.length === 0 && <Note>No Lang Lang sides have been entered for this season yet.</Note>}
          <TeamGrid title="Senior sides" teams={teams.filter((t) => !t.isJunior)} ladders={ladders} season={season} />
          <TeamGrid title="Junior sides" teams={teams.filter((t) => t.isJunior)} ladders={ladders} season={season} />
        </div>
      </section>
    </div>
  )
}

// ---- single-team view ----

async function TeamView({ team, teams, games, season }: { team: ClubTeam; teams: ClubTeam[]; games: Game[]; season: string }) {
  const ids = new Set(teams.map((t) => t.id))
  const mine = games.filter((g) => g.club.id === team.id || g.opponent.id === team.id)
  const [ladder, players] = await Promise.all([
    team.gradeId ? getLadder(team.gradeId, ids).catch(() => null) : Promise.resolve(null),
    getTeamPlayerStats(team, mine).catch((err) => {
      console.error('[playhq] team player stats', team.id, err instanceof Error ? err.message : err)
      return null
    }),
  ])
  const upcoming = sortUpcoming(mine.filter((g) => !isFinished(g)))
  const results = sortResults(mine.filter(isFinished))
  const showPlayers = players && players.gamesCounted > 0 && players.stats.length > 0
  // Stats errored outright, or every completed game's scorecard failed to load (abandoned games have none).
  const hasFinal = mine.some((g) => g.status === 'FINAL')
  const playersUnavailable = !showPlayers && hasFinal && (players === null || players.gamesCounted === 0)

  return (
    <div className="container-site space-y-14 py-12 lg:py-16">
      <TeamSwitcher teams={teams} current={team.id} season={season} />

      <section aria-labelledby="ladder">
        <HubHeading id="ladder" title="Ladder" />
        <div className="mt-5">
          {ladder ? (
            <details open className="group">
              <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-brand-gold-deep hover:text-brand-black [&::-webkit-details-marker]:hidden">
                <HugeiconsIcon icon={ArrowDown01Icon} className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
                {team.gradeName ?? 'Ladder'}
              </summary>
              <div className="mt-3">
                <LadderTable ladder={ladder} />
              </div>
            </details>
          ) : (
            <Note>{team.gradeId ? 'The ladder is not available right now.' : 'This team has not been allocated to a grade yet.'}</Note>
          )}
        </div>
      </section>

      <section aria-labelledby="fixtures-results">
        <HubHeading id="fixtures-results" title="Fixtures & results" />
        <div className="mt-5 space-y-8">
          <div>
            <h3 className="text-sm font-bold text-brand-charcoal">Upcoming <span className="font-normal text-brand-grey-light">({upcoming.length})</span></h3>
            <div className="mt-2">
              {upcoming.length ? (
                <div className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                  <GameRows games={upcoming} variant="upcoming" season={season} showTeam={false} showDate />
                </div>
              ) : (
                <Note>No upcoming fixtures.</Note>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-bold text-brand-charcoal">Results <span className="font-normal text-brand-grey-light">({results.length})</span></h3>
            <div className="mt-2">
              {results.length ? (
                <div className="rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                  <GameRows games={results} variant="result" season={season} showTeam={false} showDate />
                </div>
              ) : (
                <Note>No results yet.</Note>
              )}
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="players">
        <HubHeading id="players" title="Players" />
        <div className="mt-5">
          {showPlayers ? (
            <PlayerStatsTables stats={players.stats} gamesCounted={players.gamesCounted} />
          ) : playersUnavailable ? (
            <PlayHQUnavailable what="player stats" />
          ) : (
            <Note>Player stats will appear after the first completed match.</Note>
          )}
        </div>
      </section>
    </div>
  )
}

// ---- page ----

export default async function FixturesPage({ searchParams }: Props) {
  // Read search params outside the try so Next's dynamic-rendering bail-out isn't swallowed.
  const { season: seasonParam, team: teamParam } = searchParams
  let loaded: { groups: SeasonGroup[]; season: SeasonGroup; teams: ClubTeam[]; games: Game[] } | null = null
  try {
    const { groups, season } = await resolveSeason(seasonParam)
    if (!season) throw new Error('no seasons')
    const { teams, games } = await getClubGames(season)
    loaded = { groups, season, teams, games }
  } catch (err) {
    console.error('[playhq] fixtures page', err)
  }

  if (!loaded) {
    return (
      <main>
        <PageHeader eyebrow="Fixtures, results & teams" title="This season's matches">
          <ExternalCta />
        </PageHeader>
        <section className="container-site py-16">
          <PlayHQUnavailable what="fixtures and results" />
        </section>
      </main>
    )
  }

  const { groups, season, teams, games } = loaded
  const team = teamParam ? teams.find((t) => t.id === teamParam) : undefined

  if (team) {
    return (
      <main>
        <PageHeader eyebrow={`${season.name} · ${team.gradeName ?? team.competitionName}`} title={team.name}>
          <Link
            href={seasonHref('/fixtures', season.name)}
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
            All teams
          </Link>
        </PageHeader>
        <SeasonBar groups={groups} season={season.name} />
        <TeamView team={team} teams={teams} games={games} season={season.name} />
      </main>
    )
  }

  return (
    <main>
      <PageHeader
        eyebrow="Fixtures, results & teams"
        title="This season's matches"
        intro="The next round, the latest results and every Lang Lang side — straight from PlayHQ."
      >
        <ExternalCta />
      </PageHeader>
      <SeasonBar groups={groups} season={season.name} />
      <HubView season={season.name} teams={teams} games={games} />
    </main>
  )
}
