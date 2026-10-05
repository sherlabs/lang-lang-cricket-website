/**
 * The selector area's tabs (bottom bar on phones, top bar on desktop). Each work package adds its own entries as its pages land;
 * the account page is reached from the overview and the top bar.
 */
export type SelectorTab = { key: string; label: string; href: string }

export const selectorTabs: SelectorTab[] = [
  { key: 'overview', label: 'Overview', href: '/selector' },
  { key: 'availability', label: 'Availability', href: '/selector/availability' },
  { key: 'squads', label: 'Squads', href: '/selector/squads' },
  { key: 'teams', label: 'Teams', href: '/selector/teams' },
]

export const isTabActive = (tab: SelectorTab, pathname: string): boolean => (tab.href === '/selector' ? pathname === '/selector' : pathname === tab.href || pathname.startsWith(`${tab.href}/`))
