import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { btnQuiet } from '@/components/selector/styles'
import { CLUB_LOCALE, CLUB_TIMEZONE, fantasyPaths } from '@/config/site'
import { getOverview } from '@/lib/fantasy/queries'
import { credits } from '@/lib/fantasy/rules'
import { getClub } from '@/lib/club'
import { canonicalFor, titleWithSuffix } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const club = await getClub()
  const live = await getOverview()
  return { title: titleWithSuffix(club, live?.overview.competitionName ?? 'Fantasy cricket'), alternates: canonicalFor(fantasyPaths.home) }
}

const when = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })

/** What the game is and how it works. A plain 404 while the committee has it off or no season is open. The join link is never printed here. */
export default async function FantasyPage() {
  const live = await getOverview()
  if (!live) notFound()
  const { overview } = live
  const r = overview.season.rules
  return (
    <main>
      <PageHeader eyebrow="Stats" title={overview.competitionName} intro={`Pick ${r.squadSize} club players within a ${credits(r.salaryCapTenths)} credit salary cap. They score points from real club games. It is free to play and there are no prizes.`} />
      <section className="container-site space-y-8 py-12 lg:py-16">
        <StatsSubNav current={fantasyPaths.home} />
        <div className="grid gap-5 md:grid-cols-2">
          <article className="rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
            <h2 className="text-lg font-bold text-brand-black">How it works</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-brand-charcoal">
              <li>Choose {r.squadSize} senior club players. Their prices add up to no more than {credits(r.salaryCapTenths)} credits.</li>
              <li>Choose a captain. Their points count {r.captainMultiplier} times.</li>
              <li>You can change your squad until the first game of the weekend starts{r.transfersPerRound > 0 ? `, up to ${r.transfersPerRound} ${r.transfersPerRound === 1 ? 'player' : 'players'} a round` : ''}.</li>
              <li>Points come from the stored scorecards. Prices are a ranking of points per game, not a judgement of how good anyone is.</li>
              <li>Scorecards are sometimes corrected after a game, so a total can move a little.</li>
            </ul>
          </article>
          <article className="rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
            <h2 className="text-lg font-bold text-brand-black">{overview.season.name}</h2>
            {overview.round ? (
              <p className="mt-3 text-sm leading-relaxed text-brand-charcoal">
                {overview.round.label}: squads lock at <strong>{when.format(new Date(overview.round.locksAt))}</strong>.
              </p>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-brand-charcoal">No round is open for changes right now.</p>
            )}
            <p className="mt-3 text-sm leading-relaxed text-brand-charcoal">{overview.managers} {overview.managers === 1 ? 'team has' : 'teams have'} joined.</p>
            <p className="mt-3 text-sm leading-relaxed text-brand-charcoal">Join with the link your club shared. If you have joined already, open that link on this phone.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={fantasyPaths.team} className={btnQuiet}>My team</Link>
              <Link href={fantasyPaths.leaderboard} className={btnQuiet}>Leaderboard</Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}
