'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isTabActive, selectorTabs } from '@/lib/selector-nav'

/**
 * The selector area's frame: tabs at the top on desktop and a fixed bar at the bottom on a phone (44 px tap targets,
 * no hover-only controls). The bar is fixed to the viewport, so it would also cover the site footer, which renders after this shell
 * in the root layout: the page body gets bottom padding (bar height plus the home-indicator inset) on a phone while a selector page is shown.
 */
export function SelectorShell({ name, signOut, children }: { name: string; signOut: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  return (
    <div>
      <style>{`@media (max-width: 639px) { body { padding-bottom: calc(3.5rem + env(safe-area-inset-bottom)); } }`}</style>
      <div className="border-b border-brand-black/10 bg-brand-stone/60">
        <div className="container-site flex items-center justify-between gap-3 py-2">
          <p className="truncate text-sm text-brand-grey">Selectors{name ? ` · ${name}` : ''}</p>
          <nav aria-label="Selector tools" className="hidden items-center gap-1 sm:flex">
            {selectorTabs.map((t) => (
              <Link key={t.key} href={t.href} aria-current={isTabActive(t, pathname) ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${isTabActive(t, pathname) ? 'bg-brand-black text-white' : 'text-brand-black hover:bg-brand-black/5'}`}>
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <Link href="/selector/account" aria-current={pathname === '/selector/account' ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-brand-black underline-offset-4 hover:underline">My account</Link>
            {signOut}
          </div>
        </div>
      </div>
      {children}
      <nav aria-label="Selector tools" className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-black/10 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${selectorTabs.length}, minmax(0, 1fr))` }}>
          {selectorTabs.map((t) => (
            <li key={t.key}>
              <Link href={t.href} aria-current={isTabActive(t, pathname) ? 'page' : undefined} className={`flex min-h-14 items-center justify-center px-2 text-sm font-semibold ${isTabActive(t, pathname) ? 'bg-brand-black text-white' : 'text-brand-black'}`}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
