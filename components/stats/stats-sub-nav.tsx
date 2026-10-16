import Link from 'next/link'
import { VOTES, fantasyPaths, insightsPaths, votePaths } from '@/config/site'
import { getCachedFantasyOn } from '@/lib/fantasy/queries'
import { getCachedPublicLeaderboardOn } from '@/lib/votes-queries'
import { TabScroller } from '@/components/stats/tab-scroller'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/stats', label: 'Leaderboards' },
  { href: '/records', label: 'Records' },
  { href: '/stats/opposition', label: 'Opposition' },
  { href: insightsPaths.team, label: 'Insights' },
  { href: '/honours', label: 'Honours' },
  { href: '/players/compare', label: 'Compare' },
  { href: '/statlab', label: 'StatLab' },
  { href: '/yearbooks', label: 'Yearbooks' },
  { href: '/matches', label: 'Matches' },
] as const

type Current = (typeof LINKS)[number]['href'] | typeof votePaths.publicBoard | typeof fantasyPaths.home

/**
 * Section navigation as links (not a tablist: there are no tab panels), drawn as underline tabs on a hairline. Scrolls inside its own box on phones, with the current section scrolled into view. The best-player
 * leaderboard link is added here, for every stats page alike, while the committee has the public board switched on; the flag is
 * cached under the `votes-public` tag, which the vote settings expire, so the link does not wait for a page's own revalidation.
 */
export async function StatsSubNav({ current }: { current: Current }) {
  const showVotes = await getCachedPublicLeaderboardOn().catch(() => false)
  const showFantasy = await getCachedFantasyOn().catch(() => false)
  const links: { href: string; label: string }[] = [...LINKS, ...(showVotes ? [{ href: votePaths.publicBoard, label: VOTES.label }] : []), ...(showFantasy ? [{ href: fantasyPaths.home, label: 'Fantasy' }] : [])]
  return (
    <TabScroller label="Stats sections" className="border-b border-brand-black/10">
      <ul className="flex w-max gap-1 sm:w-auto sm:flex-wrap sm:gap-x-2">
        {links.map((l) => {
          const active = l.href === current
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-12 items-center whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition-colors sm:px-4',
                  active ? 'border-brand-gold text-brand-black' : 'border-transparent text-brand-grey hover:border-brand-black/20 hover:text-brand-black',
                )}
              >
                {l.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </TabScroller>
  )
}
