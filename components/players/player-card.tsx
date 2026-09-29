/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import type { PlayerCard } from '@/lib/players/view'
import { initials } from '@/lib/players/view'

export function PlayerCardTile({ card }: { card: PlayerCard }) {
  return (
    <Link
      href={`/history/players/${card.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover"
    >
      <div className="aspect-square w-full overflow-hidden bg-brand-stone">
        {card.photoUrl ? (
          <img src={card.photoUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <span aria-hidden className="display flex h-full w-full items-center justify-center text-5xl text-brand-grey-light">
            {initials(card.name)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <h3 className="break-words font-heading text-base font-bold text-brand-black">{card.name}</h3>
        {card.yearsLabel && (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">{card.yearsLabel}</p>
        )}
        {card.grades.length > 0 && <p className="line-clamp-1 text-xs text-brand-grey">{card.grades.join(' · ')}</p>}
      </div>
    </Link>
  )
}
