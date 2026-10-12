import type { Metadata } from 'next'
import Link from 'next/link'
import { OverviewCards } from '@/components/selector/weekend-cards'
import { VOTES, selectorPaths, votePaths } from '@/config/site'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { loadWeekendBoard } from '@/lib/selector-team-queries'
import { votesOverview } from '@/lib/selector-votes-queries'
import { netsTonight } from '@/lib/nets-queries'

export const metadata: Metadata = { title: 'Selectors', robots: { index: false, follow: false } }

const TOOLS = [
  { href: selectorPaths.teams, title: 'Teams', text: 'Pick each grade’s team and announce it.' },
  { href: selectorPaths.availability, title: 'Availability', text: 'Who is in, maybe or out for each game, and who has not replied. Nets are in here too.' },
  { href: selectorPaths.squads, title: 'Squads', text: 'Who is in each grade this season. Add, move and remove players.' },
  { href: selectorPaths.link, title: 'Player link', text: 'The one link players use to tell you if they can play.' },
  { href: selectorPaths.account, title: 'My account', text: 'Your password and Facebook sign-in.' },
] as const

type Props = { searchParams: Promise<{ weekend?: string }> }

/** The selector home and match-day overview: this weekend's games, replies, who to chase, keepers and selection status. */
export default async function SelectorHome({ searchParams }: Props) {
  const user = await requireSelection()
  const { locale } = await getClub()
  const sp = await searchParams
  const board = await loadWeekendBoard(user, { weekend: typeof sp.weekend === 'string' ? sp.weekend : null })
  const votes = await votesOverview(user)
  const tonight = await netsTonight(user)
  const tools = votes.enabled ? [{ href: votePaths.selector, title: `${VOTES.label} votes`, text: votes.openGames ? `${votes.openGames} ${votes.openGames === 1 ? 'game is' : 'games are'} open for voting. See who has voted and chase the rest.` : 'See who has voted, the leaderboard and awards night.' }, ...TOOLS] : TOOLS
  const name = (user as { name?: string | null }).name?.trim().split(/\s+/)[0]
  return (
    <main className="container-site max-w-5xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black sm:text-4xl">{name ? `Hello, ${name}` : 'Hello'}</h1>
      {board.notices.map((n) => (
        <p key={n} role="alert" className="mt-3 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{n}</p>
      ))}
      {tonight && (
        <Link href={selectorPaths.net(tonight.id)} className="mt-4 flex min-h-14 items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-brand-black/10 hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
          <span>
            <span className="block text-sm font-semibold uppercase tracking-wide text-brand-grey">Nets tonight</span>
            <span className="block text-lg font-bold text-brand-black">{tonight.title}{tonight.startTime ? ` at ${formatMatchTime(`${tonight.startTime}:00`)}` : ''}</span>
          </span>
          <span className="shrink-0 text-right text-sm font-semibold text-brand-black">{tonight.turnedUp} turned up{tonight.state === 'running' ? ' · running' : tonight.state === 'paused' ? ' · paused' : ''}</span>
        </Link>
      )}
      {board.weekends.length > 0 && (
        <>
          <h2 className="mt-6 text-xl font-bold text-brand-black">This weekend</h2>
          {board.weekends.length > 1 && (
            <nav aria-label="Weekends" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
              {board.weekends.map((w) => (
                <Link key={w.key} href={`${selectorPaths.home}?weekend=${w.key}`} aria-current={w.key === board.selected ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold ${w.key === board.selected ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
                  {formatMatchDay(w.firstDate, locale)}
                </Link>
              ))}
            </nav>
          )}
          <OverviewCards board={board} locale={locale} />
        </>
      )}
      {board.weekends.length === 0 && <p className="mt-6 rounded-xl bg-white p-5 text-brand-grey ring-1 ring-brand-black/10">There are no upcoming games stored yet. Open Availability and press Refresh fixtures to copy them from PlayHQ.</p>}
      <h2 className="mt-10 text-xl font-bold text-brand-black">Tools</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {tools.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="block min-h-11 rounded-xl bg-white p-4 ring-1 ring-brand-black/10 transition hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
              <span className="block text-lg font-bold text-brand-black">{t.title}</span>
              <span className="mt-1 block text-sm text-brand-grey">{t.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
