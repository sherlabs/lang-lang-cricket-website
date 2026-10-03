import Link from 'next/link'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/stats', label: 'Leaderboards' },
  { href: '/records', label: 'Records' },
] as const

/** Section navigation as links (not a tablist: there are no tab panels). Scrolls inside its own box on phones. */
export function StatsSubNav({ current }: { current: (typeof LINKS)[number]['href'] }) {
  return (
    <nav aria-label="Stats sections" className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-2">
        {LINKS.map((l) => {
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
