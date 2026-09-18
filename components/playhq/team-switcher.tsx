import Link from 'next/link'
import type { ClubTeam } from '@/lib/playhq/types'
import { seasonHref } from '@/lib/playhq/format'
import { cn } from '@/lib/utils'

type Props = { teams: ClubTeam[]; current: string | null; season: string }

/** Link chips for every club team (seniors first — `teams` is pre-sorted) so users can hop between sides. */
export function TeamSwitcher({ teams, current, season }: Props) {
  return (
    <nav aria-label="Switch team">
      <ul className="flex flex-wrap gap-2">
        {teams.map((t) => {
          const active = current === t.id
          return (
            <li key={t.id}>
              <Link
                href={seasonHref('/fixtures', season, t.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-sm font-semibold transition',
                  active
                    ? 'bg-brand-black text-white'
                    : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60'
                )}
              >
                {t.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
