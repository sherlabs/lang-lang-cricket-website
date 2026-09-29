import Link from 'next/link'
import type { PlayerCard } from '@/lib/players/view'
import { PlayerCardTile } from './player-card'

function Grid({ cards }: { cards: PlayerCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => (
        <PlayerCardTile key={c.id} card={c} />
      ))}
    </div>
  )
}

/** Active + Past player grids. `pastLimit` caps the past grid and links to the full list. */
export function PlayersSection({ active, past, pastLimit }: { active: PlayerCard[]; past: PlayerCard[]; pastLimit?: number }) {
  const shownPast = pastLimit ? past.slice(0, pastLimit) : past
  return (
    <div className="space-y-12">
      {active.length > 0 && (
        <div>
          <h3 className="eyebrow mb-4">Active players</h3>
          <Grid cards={active} />
        </div>
      )}
      {past.length > 0 && (
        <div id="past" className="scroll-mt-28">
          <h3 className="eyebrow mb-4">Past players</h3>
          <Grid cards={shownPast} />
          {shownPast.length < past.length && (
            <Link
              href="/history/players#past"
              className="mt-6 inline-block text-sm font-semibold text-brand-gold-deep hover:underline"
            >
              See all {past.length} past players →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
