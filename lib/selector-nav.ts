/**
 * The selector area's tabs (bottom bar on phones, top bar on desktop). Each work package adds its own entries as its pages land;
 * this one delivers the frame, the overview and the account page.
 */
export type SelectorTab = { key: string; label: string; href: string }

export const selectorTabs: SelectorTab[] = [
  { key: 'overview', label: 'Overview', href: '/selector' },
  { key: 'account', label: 'My account', href: '/selector/account' },
]

export const isTabActive = (tab: SelectorTab, pathname: string): boolean => (tab.href === '/selector' ? pathname === '/selector' : pathname === tab.href || pathname.startsWith(`${tab.href}/`))
