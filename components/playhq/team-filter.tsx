import Link from 'next/link'
import type { ClubTeam } from '@/lib/playhq/types'
import { seasonHref } from '@/lib/playhq/format'
import { cn } from '@/lib/utils'

type Props = { teams: ClubTeam[]; current: string | null; season: string; basePath: string }

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full px-3 py-1.5 text-sm font-semibold transition',
        active
          ? 'bg-brand-black text-brand-gold'
          : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60'
      )}
    >
      {children}
    </Link>
  )
}

/** Link chips: All + each club team (seniors first, then juniors — `teams` is pre-sorted). */
export function TeamFilter({ teams, current, season, basePath }: Props) {
  return (
    <nav aria-label="Filter by team" className="flex flex-col gap-2">
      <p className="eyebrow">Team</p>
      <ul className="flex flex-wrap gap-2">
        <li>
          <Chip href={seasonHref(basePath, season)} active={!current}>
            All teams
          </Chip>
        </li>
        {teams.map((t) => (
          <li key={t.id}>
            <Chip href={seasonHref(basePath, season, t.id)} active={current === t.id}>
              {t.name}
            </Chip>
          </li>
        ))}
      </ul>
    </nav>
  )
}
