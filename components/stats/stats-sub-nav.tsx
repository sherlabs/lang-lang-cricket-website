import Link from 'next/link'
import { VOTES, votePaths } from '@/config/site'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/stats', label: 'Leaderboards' },
  { href: '/records', label: 'Records' },
  { href: '/stats/opposition', label: 'Opposition' },
  { href: '/honours', label: 'Honours' },
  { href: '/players/compare', label: 'Compare' },
  { href: '/statlab', label: 'StatLab' },
  { href: '/yearbooks', label: 'Yearbooks' },
  { href: '/matches', label: 'Matches' },
] as const

/** Section navigation as links (not a tablist: there are no tab panels). Scrolls inside its own box on phones. */
export function StatsSubNav({ current, showVotes = false }: { current: (typeof LINKS)[number]['href']; showVotes?: boolean }) {
  // The best-player leaderboard exists only while the committee has switched it on, so the caller says whether to list it.
  const links: { href: string; label: string }[] = showVotes ? [...LINKS, { href: votePaths.publicBoard, label: VOTES.label }] : [...LINKS]
  return (
    <nav aria-label="Stats sections" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {links.map((l) => {
          const active = l.href === current
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-4 py-1.5 text-sm font-semibold transition',
                  active ? 'bg-brand-black text-white' : 'bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60',
                )}
              >
                {l.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
