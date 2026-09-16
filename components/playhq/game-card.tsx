import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { CalendarDaysIcon, Clock01Icon, MapPinIcon, TrophyIcon, ExternalLinkIcon } from '@hugeicons/core-free-icons'
import type { Game } from '@/lib/playhq/types'
import { formatLocalDate, formatLocalTime, dateParts, seasonHref } from '@/lib/playhq/format'
import { cn } from '@/lib/utils'

type Props = {
  game: Game
  variant: 'upcoming' | 'result'
  resultText?: string
  showTeam?: boolean
  /** Season group name; carried to the scorecard so it can resolve the club team (and junior flag) cheaply. */
  season?: string | null
}

function HomeAway({ isHome }: { isHome: boolean }) {
  return (
    <span className="ml-1.5 text-sm font-semibold text-brand-grey-light">
      <span aria-hidden>({isHome ? 'H' : 'A'})</span>
      <span className="sr-only">{isHome ? 'home' : 'away'}</span>
    </span>
  )
}

function Meta({ game }: { game: Game }) {
  const bits = [game.roundName, game.gradeName].filter(Boolean)
  if (!bits.length) return null
  return <p className="mt-1 text-xs text-brand-grey-light">{bits.join(' · ')}</p>
}

export function GameCard({ game, variant, resultText, showTeam = true, season }: Props) {
  const venue = [game.venueName, game.venueSuburb].filter(Boolean).join(', ')
  const time = formatLocalTime(game.localTime)

  if (variant === 'upcoming') {
    const parts = game.localDate ? dateParts(game.localDate) : { day: 'TBC', month: '' }
    return (
      <a
        href={game.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-5 rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover hover:ring-brand-gold/40"
      >
        <div
          aria-hidden
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-black text-brand-gold"
        >
          <span className={cn('display leading-none', parts.month ? 'text-2xl' : 'text-base')}>{parts.day}</span>
          {parts.month && (
            <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]">{parts.month}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {showTeam && <p className="eyebrow">{game.club.name}</p>}
          <p className={cn('text-lg font-bold tracking-tight text-brand-black', showTeam && 'mt-1')}>
            vs {game.opponent.name}
            <HomeAway isHome={game.club.isHome} />
          </p>
          <Meta game={game} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-grey">
            {game.localDate && (
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={CalendarDaysIcon} className="h-4 w-4 text-brand-gold-deep" aria-hidden />
                {formatLocalDate(game.localDate)}
              </span>
            )}
            {time && (
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={Clock01Icon} className="h-4 w-4 text-brand-gold-deep" aria-hidden />
                {time}
              </span>
            )}
            {venue && (
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon icon={MapPinIcon} className="h-4 w-4 text-brand-gold-deep" aria-hidden />
                {venue}
              </span>
            )}
          </div>
        </div>
        <HugeiconsIcon icon={ExternalLinkIcon} className="h-4 w-4 shrink-0 text-brand-grey-light" aria-hidden />
        <span className="sr-only">View on PlayHQ (opens in a new tab)</span>
      </a>
    )
  }

  const won = game.club.outcome?.startsWith('WON') ?? false
  const abandoned = game.status === 'ABANDONED' || game.club.outcome === 'ABANDONED'
  const badge = won ? 'W' : abandoned ? 'A' : game.club.outcome?.startsWith('LOST') ? 'L' : 'D'
  const badgeLabel = won ? 'Won' : abandoned ? 'Abandoned' : badge === 'L' ? 'Lost' : 'Drawn / no result'

  return (
    <Link
      href={seasonHref(`/fixtures/${game.id}`, season ?? null)}
      className="block rounded-2xl border-l-4 border-brand-gold bg-white p-5 shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover hover:ring-brand-gold/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {showTeam && <p className="eyebrow">{game.club.name}</p>}
          <p className={cn('text-lg font-bold tracking-tight text-brand-black', showTeam && 'mt-1')}>
            vs {game.opponent.name}
            <HomeAway isHome={game.club.isHome} />
          </p>
          <Meta game={game} />
        </div>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            won ? 'bg-brand-gold-pale text-brand-gold-deep' : 'bg-brand-stone text-brand-grey'
          )}
        >
          {won ? <HugeiconsIcon icon={TrophyIcon} className="h-4 w-4" aria-hidden /> : <span aria-hidden>{badge}</span>}
          <span className="sr-only">{badgeLabel}</span>
        </span>
      </div>
      {resultText && <p className="mt-3 text-sm leading-relaxed text-brand-charcoal">{resultText}</p>}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-grey">
        {game.localDate && (
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={CalendarDaysIcon} className="h-3.5 w-3.5 text-brand-gold-deep" aria-hidden />
            {formatLocalDate(game.localDate)}
          </span>
        )}
        {venue && (
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={MapPinIcon} className="h-3.5 w-3.5 text-brand-gold-deep" aria-hidden />
            {venue}
          </span>
        )}
        <span className="ml-auto font-semibold text-brand-gold-deep">Scorecard →</span>
      </p>
    </Link>
  )
}
