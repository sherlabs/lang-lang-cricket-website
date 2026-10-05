import type { Metadata } from 'next'
import Link from 'next/link'
import { PublishAll } from '@/components/selector/publish-all'
import { TeamCards } from '@/components/selector/weekend-cards'
import { CLUB_LOCALE, selectorPaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import { formatMatchDay } from '@/lib/selection/lineup-text'
import { getSelectionSettings } from '@/lib/selection/store'
import { loadWeekendBoard } from '@/lib/selector-team-queries'
import { getPayloadClient } from '@/lib/payload/client'

export const metadata: Metadata = { title: 'Teams', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ weekend?: string }> }

/** The all-teams view: the weekend's games, one card per grade, and Publish all ready. */
export default async function TeamsPage({ searchParams }: Props) {
  const user = await requireSelection(selectorPaths.teams)
  const sp = await searchParams
  const board = await loadWeekendBoard(user, { weekend: typeof sp.weekend === 'string' ? sp.weekend : null })
  const settings = await getSelectionSettings(await getPayloadClient())
  const ready = board.fixtures.filter((b) => b.view.status === 'ready' && b.view.chip !== 'published')
  return (
    <main className="container-site max-w-5xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black">Teams</h1>
      {board.weekends.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-brand-grey ring-1 ring-brand-black/10">There are no upcoming games stored yet. Open Availability and press Refresh fixtures to copy them from PlayHQ.</p>
      ) : (
        <>
          <nav aria-label="Weekends" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {board.weekends.map((w) => (
              <Link key={w.key} href={`${selectorPaths.teams}?weekend=${w.key}`} aria-current={w.key === board.selected ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold ${w.key === board.selected ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
                {formatMatchDay(w.firstDate, CLUB_LOCALE)}
              </Link>
            ))}
          </nav>
          <PublishAll gameIds={ready.map((b) => b.fixture.gameId)} grades={ready.map((b) => b.fixture.gradeName)} announceDefault={settings.announceOnPublish} />
          <TeamCards board={board} />
        </>
      )}
    </main>
  )
}
