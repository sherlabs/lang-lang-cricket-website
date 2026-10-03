'use client'

import { Link } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { isNavActive, type NavEntry } from '../admin/navigation'

type Props = { adminRoute: string; everyday: NavEntry[]; advanced: NavEntry[]; badges: Record<string, number> }

function Item({ entry, adminRoute, pathname, badges }: { entry: NavEntry } & Omit<Props, 'everyday' | 'advanced'> & { pathname: string }) {
  const active = isNavActive(entry, pathname, adminRoute)
  const count = entry.badge ? badges[entry.badge] : 0
  return (
    <Link className={`nav__link club-nav__link${active ? ' club-nav__link--active' : ''}`} href={`${adminRoute}${entry.path}`} id={`nav-${entry.key}`} prefetch={false} aria-current={active ? 'page' : undefined}>
      <span className="nav__link-label">{entry.label}</span>
      {count > 0 && <span className="club-nav__badge" aria-label={`${count} waiting`}>{count}</span>}
    </Link>
  )
}

/** Flat sidebar: no collapsible groups for editors; admins get a closed-by-default "Advanced" section. */
export function NavLinks({ adminRoute, everyday, advanced, badges }: Props) {
  const pathname = usePathname() ?? ''
  const advancedActive = advanced.some((e) => isNavActive(e, pathname, adminRoute))
  return (
    <div className="club-nav">
      {everyday.map((e) => (
        <Item key={e.key} entry={e} adminRoute={adminRoute} pathname={pathname} badges={badges} />
      ))}
      {advanced.length > 0 && (
        <details className="club-nav__advanced" open={advancedActive || undefined}>
          <summary>Advanced</summary>
          {advanced.map((e) => (
            <Item key={e.key} entry={e} adminRoute={adminRoute} pathname={pathname} badges={badges} />
          ))}
        </details>
      )}
    </div>
  )
}
