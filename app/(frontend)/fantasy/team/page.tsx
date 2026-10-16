import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PinPanel } from '@/components/fantasy/pin-panel'
import { TeamEditor } from '@/components/fantasy/team-editor'
import { PageHeader } from '@/components/page-header'
import { StatsSubNav } from '@/components/stats/stats-sub-nav'
import { btnQuiet } from '@/components/selector/styles'
import { CLUB_LOCALE, CLUB_TIMEZONE, fantasyPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { getTeamView, getViewer } from '@/lib/fantasy/queries'
import { getPlayableCompetition } from '@/lib/fantasy/store'
import { getPayloadClient } from '@/lib/payload/client'
import { titleWithSuffix } from '@/lib/site-metadata'
import { changePinAction, deviceCodeAction, forgetAction, saveSquadAction } from '../actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const club = await getClub()
  return { title: titleWithSuffix(club, 'My fantasy team'), robots: { index: false, follow: false } }
}

const lockFormat = new Intl.DateTimeFormat(CLUB_LOCALE, { timeZone: CLUB_TIMEZONE, weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** The manager's own team. Needs the remembered-device cookie; without it the page only says to use the club's link (it never reveals the link). */
export default async function FantasyTeamPage() {
  const payload = await getPayloadClient()
  const live = await getPlayableCompetition(payload)
  if (!live) notFound()
  const viewer = await getViewer(payload, live.season, live.settings.linkVersion)
  if (!viewer.entry) {
    return (
      <main>
        <PageHeader eyebrow="Stats" title={live.settings.competitionName} intro="Open the link your club shared to join, or to sign back in on this phone." />
        <section className="container-site py-12"><Link href={fantasyPaths.home} className={btnQuiet}>About the game</Link></section>
      </main>
    )
  }
  const view = await getTeamView(live.settings, live.season, viewer.entry)
  const round = view.round ? { key: view.round.key, label: view.round.label, locksAt: view.round.locksAt, lockText: lockFormat.format(new Date(view.round.locksAt)) } : null
  const lastRound = view.history.length ? view.history[view.history.length - 1] : null
  return (
    <main>
      <PageHeader eyebrow="Stats" title={view.entry.teamName} intro={`${view.competitionName}, ${view.seasonName}.`} />
      <section className="container-site space-y-10 py-10 lg:py-14">
        <StatsSubNav current={fantasyPaths.home} />
        {view.entry.mustChangePin ? (
          <>
            <p role="status" className="rounded-xl bg-brand-gold/15 p-5 text-sm text-brand-black">The committee gave you a temporary PIN. Choose your own now to carry on.</p>
            <PinPanel changeAction={changePinAction} deviceCode={deviceCodeAction} forget={forgetAction} forced />
          </>
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white p-4 ring-1 ring-brand-black/10"><dt className="text-xs uppercase tracking-wide text-brand-grey">Points</dt><dd className="mt-1 text-2xl font-bold text-brand-black">{view.total}</dd></div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-brand-black/10"><dt className="text-xs uppercase tracking-wide text-brand-grey">Rank</dt><dd className="mt-1 text-2xl font-bold text-brand-black">{view.rank && view.history.length ? `${view.rank} of ${view.managers}` : '-'}</dd></div>
              <div className="rounded-xl bg-white p-4 ring-1 ring-brand-black/10"><dt className="text-xs uppercase tracking-wide text-brand-grey">Last round</dt><dd className="mt-1 text-2xl font-bold text-brand-black">{lastRound ? lastRound.points : '-'}</dd></div>
            </dl>
            {view.gone.length > 0 && (
              <p role="alert" className="rounded-xl bg-status-bad-soft p-4 text-sm text-status-bad-ink ring-1 ring-status-bad/25">
                {view.gone.map((g) => g.name).join(', ')} {view.gone.length === 1 ? 'is' : 'are'} no longer in the game and score nothing. Replace {view.gone.length === 1 ? 'them' : 'them'} before the lock.
              </p>
            )}
            <TeamEditor
              round={round}
              rules={{ squadSize: view.rules.squadSize, salaryCapTenths: view.rules.salaryCapTenths, transfersPerRound: view.rules.transfersPerRound, captainMultiplier: view.rules.captainMultiplier }}
              pool={view.pool}
              initialPicks={view.picks}
              initialCaptain={view.captain}
              previous={view.previous}
              minGames={view.rules.minGamesForPrice}
              save={saveSquadAction}
            />
            {view.history.length > 0 && (
              <section aria-labelledby="history" className="rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
                <h2 id="history" className="text-lg font-bold text-brand-black">Your rounds</h2>
                <ul className="mt-3 divide-y divide-brand-black/5 text-sm">
                  {view.history.map((h) => (
                    <li key={h.round} className="flex justify-between gap-4 py-2"><span className="text-brand-charcoal">{h.label}{h.provisional ? ' (not final)' : ''}</span><span className="font-semibold text-brand-black">{h.points}</span></li>
                  ))}
                </ul>
                <p className="mt-3"><Link href={fantasyPaths.leaderboard} className={btnQuiet}>Leaderboard</Link></p>
              </section>
            )}
            <PinPanel changeAction={changePinAction} deviceCode={deviceCodeAction} forget={forgetAction} forced={false} />
          </>
        )}
      </section>
    </main>
  )
}
