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

// Votes are reached from the Overview (no fifth tab), so the Overview stays lit while a vote page is open.
const OVERVIEW_CHILDREN = ['/selector/votes']

// Net sessions are a weekly job like availability, so they live inside the Availability section (still four tabs, no "More").
const TAB_CHILDREN: Record<string, string[]> = { '/selector': OVERVIEW_CHILDREN, '/selector/availability': ['/selector/nets'] }

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`)

export const isTabActive = (tab: SelectorTab, pathname: string): boolean =>
  tab.href === '/selector' ? pathname === '/selector' || OVERVIEW_CHILDREN.some((p) => under(pathname, p)) : under(pathname, tab.href) || (TAB_CHILDREN[tab.href] ?? []).some((p) => under(pathname, p))
