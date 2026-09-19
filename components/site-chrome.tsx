'use client'

import { usePathname } from 'next/navigation'

/** Hides the public header/footer under /admin, which has its own shell. */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname.startsWith('/admin')) return null
  return <>{children}</>
}
