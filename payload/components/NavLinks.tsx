'use client'

import { Link } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import { isNavActive, navSections, type NavEntry } from '../admin/navigation'
import { Disclosure } from './ui/Disclosure'
import { Icon } from './ui/Icon'
import { StatusPill } from './ui/StatusPill'

type Props = { adminRoute: string; everyday: NavEntry[]; advanced: NavEntry[]; badges: Record<string, number> }

function Item({ entry, adminRoute, pathname, badges }: { entry: NavEntry } & Omit<Props, 'everyday' | 'advanced'> & { pathname: string }) {
  const active = isNavActive(entry, pathname, adminRoute)
  const count = entry.badge ? badges[entry.badge] : 0
  return (
    <Link className={`nav__link club-nav__link${active ? ' club-nav__link--active' : ''}`} href={`${adminRoute}${entry.path}`} id={`nav-${entry.key}`} prefetch={false} aria-current={active ? 'page' : undefined}>
      <Icon name={entry.icon} size={20} className="club-nav__icon" />
      <span className="nav__link-label">{entry.label}</span>
      {count > 0 && (
        <StatusPill tone="accent" label={`${count} waiting`} className="club-nav__badge">
          {count}
        </StatusPill>
      )}
    </Link>
  )
}

function Sections({ entries, by, ...rest }: { entries: NavEntry[]; by: 'group' | 'subgroup' } & Omit<Props, 'everyday' | 'advanced'> & { pathname: string }) {
  return (
    <>
      {navSections(entries, by).map((section) => {
        const headingId = section.label ? `nav-heading-${section.key}` : undefined
        return (
          <div key={section.key || 'rest'} className="club-nav__section" role="group" aria-labelledby={headingId}>
            {section.label && (
              <h2 className="club-nav__heading" id={headingId}>
                {section.label}
              </h2>
            )}
            {section.entries.map((e) => (
              <Item key={e.key} entry={e} {...rest} />
            ))}
          </div>
        )
      })}
    </>
  )
}

/**
 * The sidebar links, task-first: group headings over the existing entries (labels only, see `navGroups`), an icon on every entry,
 * and, for people who have them, a closed-by-default "Advanced" disclosure.
 */
export function NavLinks({ adminRoute, everyday, advanced, badges }: Props) {
  const pathname = usePathname() ?? ''
  const advancedActive = advanced.some((e) => isNavActive(e, pathname, adminRoute))
  const shared = { adminRoute, pathname, badges }
  return (
    <div className="club-nav">
      <Sections entries={everyday} by="group" {...shared} />
      {advanced.length > 0 && (
        <Disclosure summary="Advanced" open={advancedActive} className="club-nav__advanced">
          <Sections entries={advanced} by="subgroup" {...shared} />
        </Disclosure>
      )}
    </div>
  )
}
