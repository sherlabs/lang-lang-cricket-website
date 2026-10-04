import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, CallIcon } from '@hugeicons/core-free-icons'
import { Avatar } from '@/components/avatar'
import type { Person } from '@/lib/domain'
import { cn } from '@/lib/utils'

/** One committee member, coach or contact. Every page shows individuals through this card. */
export function PersonCard({ person: c }: { person: Person }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/40">
      <div className="relative aspect-square w-full overflow-hidden bg-brand-gold-pale">
        <Avatar
          name={c.name}
          photoUrl={c.photoUrl}
          imgClassName="transition duration-300 group-hover:scale-105"
          initialsClassName="font-heading text-5xl font-bold tracking-wide text-brand-gold-deep/70"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-black/95 via-brand-black/55 via-55% to-transparent p-4 pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold-light">{c.role}</p>
          <h3 className="mt-0.5 text-lg font-bold leading-tight tracking-tight text-white">{c.name}</h3>
        </div>
      </div>
      {(c.phone || c.email || c.playerSlug) && (
        <ul className="space-y-1 p-5 text-sm text-brand-grey">
          {c.phone && (
            <li>
              <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="inline-flex min-h-9 items-center gap-2 rounded-md transition hover:text-brand-black">
                <HugeiconsIcon icon={CallIcon} className="h-3.5 w-3.5 shrink-0 text-brand-gold-deep" aria-hidden />
                {c.phone}
              </a>
            </li>
          )}
          {c.email && (
            <li>
              <a href={`mailto:${c.email}`} className="inline-flex min-h-9 items-center gap-2 break-all rounded-md transition hover:text-brand-black">
                <HugeiconsIcon icon={Mail01Icon} className="h-3.5 w-3.5 shrink-0 text-brand-gold-deep" aria-hidden />
                {c.email}
              </a>
            </li>
          )}
          {c.playerSlug && (
            <li>
              <Link href={`/players/${c.playerSlug}`} className="inline-flex min-h-9 items-center rounded-md font-semibold text-brand-gold-deep underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-black">
                Player profile
              </Link>
            </li>
          )}
        </ul>
      )}
    </article>
  )
}

export function PeopleGrid({ people, className }: { people: Person[]; className?: string }) {
  if (people.length === 0) {
    return <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">Committee details will be published soon.</p>
  }
  return (
    <div className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {people.map((p) => (
        <PersonCard key={`${p.id}-${p.section}`} person={p} />
      ))}
    </div>
  )
}
