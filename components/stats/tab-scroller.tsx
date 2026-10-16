'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Horizontally scrolling strip for the stats tab rows. On mount the current tab is scrolled into view, so on a phone the
 * active section is never hidden off the edge. Edge fades (a CSS mask) hint that more tabs sit out of sight; they are
 * dropped once the row fits, where it needs no hint.
 */
export function TabScroller({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    const current = el?.querySelector<HTMLElement>('[aria-current]')
    if (!el || !current) return
    // Scroll the strip itself, never the page.
    el.scrollLeft = Math.max(0, current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2)
  }, [])
  return (
    <nav aria-label={label} className={cn('stats-tabs-scroll relative -mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0', className)} ref={ref}>
      {children}
    </nav>
  )
}
