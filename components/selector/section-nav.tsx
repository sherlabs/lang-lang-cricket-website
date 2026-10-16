import Link from 'next/link'
import { selectorPaths } from '@/config/site'

const ITEMS = [
  { key: 'availability', label: 'Availability', href: selectorPaths.availability },
  { key: 'nets', label: 'Nets', href: selectorPaths.nets },
  { key: 'link', label: 'Link', href: selectorPaths.link },
] as const

/** The Availability section's own sub-nav (wave B spec 4.1): Availability | Nets | Link. The bottom tab bar stays at four tabs. */
export function AvailabilitySectionNav({ current }: { current: (typeof ITEMS)[number]['key'] }) {
  return (
    <nav aria-label="Availability section" className="mb-4 flex gap-2">
      {ITEMS.map((i) => (
        <Link key={i.key} href={i.href} aria-current={i.key === current ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold ${i.key === current ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  )
}
