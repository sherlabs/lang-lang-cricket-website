import { Suspense } from 'react'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, RankingIcon, CalendarDaysIcon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { SeasonPicker } from '@/components/playhq/season-picker'
import { PlayHQUnavailable } from '@/components/playhq/playhq-unavailable'
import { resolveSeason, getClubGames, getLadder, isFinished, mapLimit, resultSentence, sortResults, sortUpcoming } from '@/lib/playhq'
import type { ClubTeam, Game, Ladder } from '@/lib/playhq/types'
import { formatLocalDate } from '@/lib/playhq/format'

export const revalidate = 1800

export const metadata = {
  title: 'Teams | Lang Lang Cricket Club',
}

type Props = { searchParams: { season?: string } }

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function ladderLine(ladder: Ladder | null, teamId: string) {
  const row = ladder?.rows.find((r) => r.teamId === teamId)
  if (!ladder || !row) return null
  const parts = [`${ordinal(row.position)} of ${ladder.rows.length}`]
  const won = row.values.won
  const lost = row.values.lost
  if (typeof won === 'number' && typeof lost === 'number' && won + lost > 0) parts.push(`${won}W ${lost}L`)
  return parts.join(' · ')
}

function nextOrLast(team: ClubTeam, games: Game[]) {
  const mine = games.filter((g) => g.club.id === team.id)
  const next = sortUpcoming(mine.filter((g) => !isFinished(g)))[0]
  if (next) {
    const when = next.localDate ? formatLocalDate(next.localDate, { weekday: true }).replace(/ \d{4}$/, '') : 'TBC'
    return { label: 'Next', text: `${when} v ${next.opponent.name} (${next.club.isHome ? 'H' : 'A'})` }
  }
  const last = sortResults(mine.filter(isFinished))[0]
  if (last) return { label: 'Last', text: resultSentence(last) || `v ${last.opponent.name}` }
  return null
}

function TeamCard({ team, ladder, games }: { team: ClubTeam; ladder: Ladder | null; games: Game[] }) {
  const standing = ladderLine(ladder, team.id)
  const game = nextOrLast(team, games)
  return (
    <li>
      <Link
        href={`/teams/${team.id}`}
        className="group flex h-full flex-col rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover hover:ring-brand-gold/40"
      >
        <p className="eyebrow">{team.gradeName ?? 'Grade not yet assigned'}</p>
        <h3 className="display mt-2 text-2xl text-brand-black group-hover:text-brand-gold-deep">{team.name}</h3>
        <dl className="mt-4 space-y-2 text-sm text-brand-grey">
          {standing && (
            <div className="flex items-start gap-2">
              <dt className="sr-only">Ladder</dt>
              <HugeiconsIcon icon={RankingIcon} className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-deep" aria-hidden />
              <dd className="font-semibold text-brand-charcoal">{standing}</dd>
            </div>
          )}
          {game && (
            <div className="flex items-start gap-2">
              <dt className="sr-only">{game.label}</dt>
              <HugeiconsIcon icon={CalendarDaysIcon} className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold-deep" aria-hidden />
              <dd>
                <span className="font-semibold text-brand-charcoal">{game.label}:</span> {game.text}
              </dd>
            </div>
          )}
          {!standing && !game && <p>Season details coming soon.</p>}
        </dl>
        <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-brand-gold-deep">
          Ladder, results &amp; players
          <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </li>
  )
}

function Group({ title, teams, ladders, games }: { title: string; teams: ClubTeam[]; ladders: Map<string, Ladder | null>; games: Game[] }) {
  if (!teams.length) return null
  return (
    <div>
      <div className="flex items-center gap-3">
        <h2 className="display text-3xl text-brand-black sm:text-4xl">{title}</h2>
        <span className="rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep">
          {teams.length}
        </span>
        <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
      </div>
      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <TeamCard key={t.id} team={t} ladder={t.gradeId ? (ladders.get(t.gradeId) ?? null) : null} games={games} />
        ))}
      </ul>
    </div>
  )
}

export default async function TeamsPage({ searchParams }: Props) {
  // Read search params outside the try so Next's dynamic-rendering bail-out isn't swallowed.
  const { season: seasonParam } = searchParams
  let content: React.ReactNode
  try {
    const { groups, season } = await resolveSeason(seasonParam)
    if (!season) throw new Error('no seasons')
    const { teams, games } = await getClubGames(season)
    const ids = new Set(teams.map((t) => t.id))
    const gradeIds = [...new Set(teams.map((t) => t.gradeId).filter((g): g is string => !!g))]
    const ladderList = await mapLimit(gradeIds, 5, (g) => getLadder(g, ids).catch(() => null))
    const ladders = new Map(gradeIds.map((g, i) => [g, ladderList[i]]))
    const seniors = teams.filter((t) => !t.isJunior)
    const juniors = teams.filter((t) => t.isJunior)

    content = (
      <>
        <section className="border-b border-brand-black/10 bg-brand-cream">
          <div className="container-site py-8">
            <Suspense fallback={<div className="min-h-11" aria-hidden />}>
              <SeasonPicker groups={groups} current={season.name} basePath="/teams" />
            </Suspense>
          </div>
        </section>
        <section className="container-site space-y-16 py-16 lg:py-24">
          {teams.length === 0 && (
            <div className="rounded-2xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
              No Lang Lang sides have been entered for this season yet.
            </div>
          )}
          <Group title="Senior sides" teams={seniors} ladders={ladders} games={games} />
          <Group title="Junior sides" teams={juniors} ladders={ladders} games={games} />
        </section>
      </>
    )
  } catch (err) {
    console.error('[playhq] teams page', err)
    content = (
      <section className="container-site py-16">
        <PlayHQUnavailable what="teams" />
      </section>
    )
  }

  return (
    <main>
      <PageHeader
        eyebrow="Our teams"
        title="Every Lang Lang side"
        intro="Ladders, fixtures, results and player stats for each of our senior and junior teams, live from PlayHQ."
      />
      {content}
    </main>
  )
}
