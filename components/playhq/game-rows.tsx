import Link from 'next/link'
import type { Game } from '@/lib/playhq/types'
import { resultSentence } from '@/lib/playhq/games'
import { formatLocalDate, formatLocalTime, seasonHref } from '@/lib/playhq/format'
import { cn } from '@/lib/utils'

type Props = {
  games: Game[]
  variant: 'upcoming' | 'result'
  /** Show the Lang Lang side as the first column (club-wide lists). */
  showTeam?: boolean
  /** Season group name; carried to the scorecard so it can resolve the club team cheaply. */
  season: string
  /** Show a date column (lists that aren't already grouped under a date heading). */
  showDate?: boolean
  caption?: string
}

const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light'
const td = 'px-3 py-2.5 align-top text-sm'
const wide = 'hidden sm:table-cell'

function HomeAway({ isHome }: { isHome: boolean }) {
  return (
    <span className="ml-1 text-xs font-semibold text-brand-grey-light">
      <span aria-hidden>({isHome ? 'H' : 'A'})</span>
      <span className="sr-only">{isHome ? 'home' : 'away'}</span>
    </span>
  )
}

function meta(game: Game) {
  return [game.gradeName, game.roundAbbr ?? game.roundName].filter(Boolean).join(' · ')
}

function outcome(game: Game) {
  const won = game.club.outcome?.startsWith('WON') ?? false
  const abandoned = game.status === 'ABANDONED' || game.club.outcome === 'ABANDONED'
  const lost = game.club.outcome?.startsWith('LOST') ?? false
  const badge = won ? 'W' : abandoned ? 'A' : lost ? 'L' : 'D'
  const label = won ? 'Won' : abandoned ? 'Abandoned' : lost ? 'Lost' : 'Drawn / no result'
  return { badge, label, won }
}

function Pill({ game }: { game: Game }) {
  const { badge, label, won } = outcome(game)
  return (
    <span
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
        won ? 'bg-brand-gold-pale text-brand-gold-deep' : 'bg-brand-stone text-brand-grey'
      )}
    >
      <span aria-hidden>{badge}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Compact one-line-per-game table. On mobile the Time/Venue/Grade (or
 * Date) columns collapse into a muted line under the opponent so nothing
 * scrolls sideways at 375px.
 */
export function GameRows({ games, variant, showTeam = true, season, showDate = false, caption }: Props) {
  if (!games.length) return null
  const upcoming = variant === 'upcoming'
  return (
    <table className="w-full border-collapse">
      <caption className="sr-only">{caption ?? (upcoming ? 'Upcoming fixtures' : 'Results')}</caption>
      <thead>
        <tr className="border-b border-brand-black/10">
          {showTeam && <th scope="col" className={th}>Team</th>}
          <th scope="col" className={th}>{upcoming ? 'Opponent' : 'Result'}</th>
          {upcoming ? (
            <>
              <th scope="col" className={cn(th, wide)}>Time</th>
              <th scope="col" className={cn(th, wide)}>Venue</th>
              <th scope="col" className={cn(th, wide)}>Grade</th>
            </>
          ) : (
            <>
              <th scope="col" className={cn(th, 'w-12 text-center')}><span className="sr-only">Outcome</span></th>
              {showDate && <th scope="col" className={cn(th, wide)}>Date</th>}
              <th scope="col" className={cn(th, wide)}><span className="sr-only">Scorecard</span></th>
            </>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-brand-black/5">
        {games.map((g) => {
          const venue = [g.venueName, g.venueSuburb].filter(Boolean).join(', ')
          const time = formatLocalTime(g.localTime)
          const date = g.localDate ? formatLocalDate(g.localDate) : null
          const scorecard = seasonHref(`/fixtures/${g.id}`, season)
          const detail = meta(g)
          return (
            <tr key={g.id} className="hover:bg-brand-stone/60">
              {showTeam && (
                <td className={cn(td, 'font-semibold text-brand-black sm:whitespace-nowrap')}>{g.club.name}</td>
              )}
              {upcoming ? (
                <>
                  <td className={cn(td, 'text-brand-charcoal')}>
                    <span className="font-medium text-brand-black">{g.opponent.name}</span>
                    <HomeAway isHome={g.club.isHome} />
                    <span className="mt-0.5 block text-xs text-brand-grey-light sm:hidden">
                      {[time, venue, detail].filter(Boolean).join(' · ')}
                    </span>
                  </td>
                  <td className={cn(td, wide, 'whitespace-nowrap tabular-nums text-brand-charcoal')}>{time ?? '–'}</td>
                  <td className={cn(td, wide, 'text-brand-charcoal')}>{venue || '–'}</td>
                  <td className={cn(td, wide, 'text-xs text-brand-grey-light')}>{detail || '–'}</td>
                </>
              ) : (
                <>
                  <td className={cn(td, 'text-brand-charcoal')}>
                    <span className="font-medium text-brand-black">
                      {resultSentence(g) || `v ${g.opponent.name}`}
                    </span>
                    <HomeAway isHome={g.club.isHome} />
                    <span className="mt-0.5 block text-xs text-brand-grey-light sm:hidden">
                      {[showDate ? date : null, detail, ''].filter((x) => x !== null).join(' · ')}
                      <Link href={scorecard} className="font-semibold text-brand-gold-deep hover:underline">
                        Scorecard →
                      </Link>
                    </span>
                  </td>
                  <td className={cn(td, 'text-center')}>
                    <Pill game={g} />
                  </td>
                  {showDate && <td className={cn(td, wide, 'whitespace-nowrap text-brand-charcoal')}>{date ?? 'TBC'}</td>}
                  <td className={cn(td, wide, 'whitespace-nowrap text-right')}>
                    <Link href={scorecard} className="text-sm font-semibold text-brand-gold-deep hover:underline">
                      Scorecard →<span className="sr-only"> for {g.club.name} v {g.opponent.name}</span>
                    </Link>
                  </td>
                </>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
