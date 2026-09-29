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

/** Active + Past player grids; a grid is omitted when it has no cards. */
export function PlayersSection({ active, past }: { active: PlayerCard[]; past: PlayerCard[] }) {
  return (
    <div className="space-y-12">
      {active.length > 0 && (
        <div>
          <h2 className="eyebrow mb-4">Active players · {active.length}</h2>
          <Grid cards={active} />
        </div>
      )}
      {past.length > 0 && (
        <div id="past" className="scroll-mt-28">
          <h2 className="eyebrow mb-4">Past players · {past.length}</h2>
          <Grid cards={past} />
        </div>
      )}
    </div>
  )
}
