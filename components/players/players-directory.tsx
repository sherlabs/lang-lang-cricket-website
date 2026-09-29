'use client'

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import type { PlayerCard } from '@/lib/players/view'
import { PlayersSection } from './players-section'

// Case- and accent-insensitive, so "zoe" finds "Zoë".
const normalise = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function matches(card: PlayerCard, terms: string[]) {
  const haystack = normalise(`${card.name} ${card.grades.join(' ')}`)
  return terms.every((t) => haystack.includes(t))
}

/** Players page body: search box filtering the Active and Past grids in place (the full list is small). */
export function PlayersDirectory({ active, past }: { active: PlayerCard[]; past: PlayerCard[] }) {
  const [query, setQuery] = useState('')
  const terms = useMemo(() => normalise(query).split(/\s+/).filter(Boolean), [query])
  const shownActive = terms.length ? active.filter((c) => matches(c, terms)) : active
  const shownPast = terms.length ? past.filter((c) => matches(c, terms)) : past
  const none = shownActive.length + shownPast.length === 0

  return (
    <div>
      <div className="relative mb-10 max-w-md">
        <label htmlFor="player-search" className="sr-only">
          Search players
        </label>
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-grey"
          aria-hidden
        />
        <input
          id="player-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or grade"
          autoComplete="off"
          className="h-12 w-full rounded-full border border-brand-black/10 bg-white pl-12 pr-12 text-base text-brand-black shadow-card outline-none transition placeholder:text-brand-grey focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-brand-grey transition hover:bg-brand-stone hover:text-brand-black"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <p role="status" className="sr-only">
        {terms.length ? `${shownActive.length + shownPast.length} players found` : ''}
      </p>

      {none ? (
        <p className="text-brand-grey">No players match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <PlayersSection active={shownActive} past={shownPast} />
      )}
    </div>
  )
}
