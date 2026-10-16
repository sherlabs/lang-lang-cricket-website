import Link from 'next/link'
import { CLUB_TIMEZONE } from '@/config/site'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import type { PublicTeam } from '@/lib/teams-queries'

const tag = 'ml-2 inline-flex items-center rounded-full bg-brand-gold px-2 py-0.5 text-xs font-bold text-brand-black'

/** One published team: the game, then the XI. Server-rendered; names link to the public player page (a withheld player is plain text). */
export function TeamCard({ team, locale, heading = 'h2', linkTo }: { team: PublicTeam; locale: string; heading?: 'h2' | 'h3'; linkTo?: string }) {
  const H = heading
  const when = [formatMatchDay(team.localDate, locale), formatMatchTime(team.localTime)].filter(Boolean).join(' ')
  const venue = [team.venueName, team.venueSuburb].filter(Boolean).join(', ')
  const List = team.showOrder ? 'ol' : 'ul'
  return (
    <article className="rounded-2xl bg-white p-5 ring-1 ring-brand-black/10 sm:p-6">
      <p className="eyebrow">{team.gradeName}</p>
      <H className="mt-1 text-2xl font-bold tracking-tight text-brand-black">
        {linkTo ? <Link href={linkTo} className="underline-offset-4 hover:underline">{`${team.roundName ? `${team.roundName} ` : ''}v ${team.opponentName}`}</Link> : `${team.roundName ? `${team.roundName} ` : ''}v ${team.opponentName}`}
      </H>
      <p className="mt-1 text-brand-grey">{[when, venue].filter(Boolean).join(' · ')}</p>
      {team.updated && (
        <p className="mt-2 inline-flex rounded-full bg-brand-gold-pale px-3 py-1 text-sm font-semibold text-brand-gold-deep ring-1 ring-brand-gold/30">
          Updated <time dateTime={team.publishedAt} className="ml-1">{new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: CLUB_TIMEZONE }).format(new Date(team.publishedAt))}</time>
        </p>
      )}
      <List className="mt-4 divide-y divide-brand-black/10 border-y border-brand-black/10">
        {team.slots.map((s, i) => (
          <li key={i} className="flex items-center gap-3 py-2.5 text-lg text-brand-charcoal">
            {team.showOrder && <span aria-label={`Batting position ${s.order}`} className="w-7 shrink-0 text-right font-bold tabular-nums text-brand-gold-deep">{s.order}</span>}
            <span className="min-w-0 flex-1 truncate">
              {s.slug ? <Link href={`/players/${s.slug}`} className="font-semibold text-brand-black underline-offset-4 hover:underline">{s.name}</Link> : <span className={s.withheld ? 'italic text-brand-grey' : 'font-semibold text-brand-black'}>{s.name}</span>}
              {s.isCaptain && <span className={tag} title="Captain">C</span>}
              {s.isKeeper && <span className={tag} title="Wicketkeeper">WK</span>}
            </span>
          </li>
        ))}
      </List>
    </article>
  )
}
