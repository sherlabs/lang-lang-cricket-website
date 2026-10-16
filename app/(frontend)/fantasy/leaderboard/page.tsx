import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/page-header'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { CLUB_LOCALE, CLUB_TIMEZONE, fantasyPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { canSeeLeaderboard, getLeaderboardView, getViewer } from '@/lib/fantasy/queries'
import { SCORING_KEYS, SCORING_LABELS } from '@/lib/fantasy/rules'
import { getPlayableCompetition } from '@/lib/fantasy/store'
import { getPayloadClient } from '@/lib/payload/client'
import { titleWithSuffix } from '@/lib/site-metadata'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export async function generateMetadata(): Promise<Metadata> {
  const club = await getClub()
  return { title: titleWithSuffix(club, 'Fantasy leaderboard'), robots: { index: false, follow: true } }
}

const pill = (active: boolean) =>
  cn('inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition', active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60')

const stamp = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, day: 'numeric', month: 'short' })

export default async function FantasyLeaderboardPage({ searchParams }: Props) {
  const sp = await searchParams
  const payload = await getPayloadClient()
  const live = await getPlayableCompetition(payload)
  if (!live) notFound()
  const viewer = await getViewer(payload, live.season, live.settings.linkVersion)
  const roundParam = typeof sp.round === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.round) ? sp.round : null
  const allowed = canSeeLeaderboard(live.settings, viewer)
  const view = allowed ? await getLeaderboardView(live.settings, live.season, viewer, roundParam) : null
  const href = (round: string | null) => (round ? `${fantasyPaths.leaderboard}?round=${round}` : fantasyPaths.leaderboard)
  return (
    <main>
      <PageHeader eyebrow="Stats" title={`${live.settings.competitionName} leaderboard`} intro={`${live.season.name}. Points from the stored scorecards; the captain counts ${live.season.rules.captainMultiplier} times.`} />
      <section className="container-site space-y-10 py-10 lg:py-14">
        <StatsSubNav current={fantasyPaths.home} />
        {!view ? (
          <p className="rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">The leaderboard is shared with members who have joined.</p>
        ) : (
          <>
            {view.rounds.length > 0 && (
              <nav aria-label="Rounds" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
                <ul className="flex w-max gap-2">
                  <li><Link href={href(null)} aria-current={!view.selected ? 'page' : undefined} className={pill(!view.selected)}>Season</Link></li>
                  {view.rounds.map((r) => (
                    <li key={r.key}><Link href={href(r.key)} aria-current={view.selected?.key === r.key ? 'page' : undefined} className={pill(view.selected?.key === r.key)}>{stamp.format(new Date(`${r.key}T12:00:00Z`))}</Link></li>
                  ))}
                </ul>
              </nav>
            )}
            {view.rows.length === 0 ? (
              <p className="rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">No teams have joined yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-brand-black/10" tabIndex={0} role="region" aria-label={`${view.competitionName} leaderboard`}>
                <table className="w-full min-w-[20rem] text-left text-sm">
                  <caption className="sr-only">{view.selected ? `${view.selected.label} points` : 'Season points'} by team</caption>
                  <thead className="border-b border-brand-black/10 text-xs uppercase tracking-wide text-brand-grey">
                    <tr>
                      <th scope="col" className="px-3 py-2">Rank</th>
                      <th scope="col" className="px-3 py-2">Team</th>
                      <th scope="col" className="px-3 py-2 text-right">{view.selected ? 'Round' : 'Total'}</th>
                      {!view.selected && <th scope="col" className="px-3 py-2 text-right">Best round</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {view.rows.map((r) => (
                      <tr key={r.entry} className={cn('border-b border-brand-black/5 last:border-0', view.mine === r.entry && 'bg-brand-gold/10')}>
                        <td className="px-3 py-2 font-semibold text-brand-black">{r.rank}</td>
                        <td className="px-3 py-2 text-brand-black">{r.teamName}{view.mine === r.entry && <span className="ml-2 text-xs text-brand-grey">(you)</span>}</td>
                        <td className="px-3 py-2 text-right font-semibold text-brand-black">{r.total}{r.rounds.some((x) => x.provisional) && <span className="ml-1 text-xs font-normal text-brand-grey" title="Some rounds are not final yet">*</span>}</td>
                        {!view.selected && <td className="px-3 py-2 text-right text-brand-grey">{r.best}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {view.rounds.some((r) => r.provisional) && (
              <p className="text-sm text-brand-grey">
                * Points are provisional until every game of a round has its scorecard. {view.rounds.filter((r) => r.closedByCommittee).map((r) => `${r.label} was closed by the committee${view.reasons[r.key] ? ` (${view.reasons[r.key]})` : ''}.`).join(' ')}
              </p>
            )}
            <details className="rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
              <summary className="min-h-11 cursor-pointer text-base font-semibold text-brand-black">How points are scored</summary>
              <ul className="mt-3 divide-y divide-brand-black/5 text-sm">
                {SCORING_KEYS.map((k) => (
                  <li key={k} className="flex items-baseline justify-between gap-4 py-2"><span className="text-brand-charcoal">{SCORING_LABELS[k]}</span><span className="font-semibold text-brand-black">{view.scoringRules[k] > 0 ? `+${view.scoringRules[k]}` : view.scoringRules[k]}</span></li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-brand-grey">A statistic the scorer did not record scores nothing. Your captain counts {view.captainMultiplier} times. Scorecards can be corrected after a game, so totals can move a little.</p>
            </details>
          </>
        )}
      </section>
    </main>
  )
}
