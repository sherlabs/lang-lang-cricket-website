// @committee-facing
'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { activeChip, chipHref, type FilterChip } from '../../lib/admin/filter-chips'

/**
 * Plain filters above a list ("Showing", "Hidden", "Playing now"), as links so they work without script and can be shared. They set the
 * same `where` query Payload's own Filters button uses, which stays available below for anything more specific.
 */
export function ListFilterChips({ chips, label = 'Show', allLabel = 'All' }: { chips: FilterChip[]; label?: string; allLabel?: string }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const { chip: active, custom } = activeChip(new URLSearchParams(params?.toString() ?? ''), chips)
  const current = new URLSearchParams(params?.toString() ?? '')
  const items: Array<{ key: string; label: string; chip: FilterChip | null; on: boolean }> = [
    { key: 'all', label: allLabel, chip: null, on: !active && !custom },
    ...chips.map((c) => ({ key: c.key, label: c.label, chip: c, on: active?.key === c.key })),
  ]
  return (
    <nav className="club-chips" aria-label={label}>
      {items.map((i) => (
        <Link key={i.key} className="club-chip" href={chipHref(pathname ?? '', current, i.chip)} aria-current={i.on ? 'true' : undefined} data-on={i.on ? 'true' : undefined} scroll={false}>
          {i.label}
        </Link>
      ))}
      {custom ? <span className="club-chips__custom">Custom filter on</span> : null}
    </nav>
  )
}
