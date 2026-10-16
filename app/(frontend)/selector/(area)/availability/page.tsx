import type { Metadata } from 'next'
import Link from 'next/link'
import { AvailabilitySectionNav } from '@/components/selector/section-nav'
import { AvailabilityBoardView } from '@/components/selector/availability-board'
import { RefreshFixtures } from '@/components/selector/refresh-fixtures'
import { CLUB_COUNTRY, selectorPaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import { loadAvailabilityBoard } from '@/lib/selector-availability-queries'
import { refreshFixturesAction } from '../../board-actions'

export const metadata: Metadata = { title: 'Availability', robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ grade?: string }> }

export default async function AvailabilityPage({ searchParams }: Props) {
  const user = await requireSelection(selectorPaths.availability)
  const sp = await searchParams
  const board = await loadAvailabilityBoard(user, { gradeId: typeof sp.grade === 'string' ? sp.grade : null })
  return (
    <main className="container-site max-w-5xl py-6 sm:py-10">
      <AvailabilitySectionNav current="availability" />
      <h1 className="display text-3xl text-brand-black">Availability</h1>
      {!board.linkEnabled && <p className="mt-3 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">The player link is switched off, so players cannot reply themselves. Switch it on under Player link.</p>}
      {board.guessing && <p role="alert" className="mt-3 rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">Someone is guessing PINs on the availability link. New sign-ins are paused for a while. Consider rotating the link.</p>}
      {board.pinClashes.length > 0 && (
        <p role="status" className="mt-3 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">
          PIN clash between players called {board.pinClashes.join(', ')}. Give one of each pair their own PIN on their player card.
        </p>
      )}
      <div className="mt-4"><RefreshFixtures action={refreshFixturesAction} /></div>

      {board.grades.length === 0 ? (
        <p className="mt-8 rounded-xl bg-white p-5 text-brand-grey ring-1 ring-brand-black/10">There are no upcoming games stored yet. Press Refresh fixtures to copy them from PlayHQ.</p>
      ) : (
        <>
          <nav aria-label="Grades" className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
            {board.grades.map((g) => (
              <Link key={g.gradeId} href={`${selectorPaths.availability}?grade=${encodeURIComponent(g.gradeId)}`} aria-current={g.gradeId === board.gradeId ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold ${g.gradeId === board.gradeId ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
                {g.gradeName}
              </Link>
            ))}
          </nav>
          <div className="mt-4">
            <AvailabilityBoardView key={board.gradeId ?? 'none'} board={{ fixtures: board.fixtures, players: board.players }} country={CLUB_COUNTRY} />
          </div>
        </>
      )}
    </main>
  )
}
