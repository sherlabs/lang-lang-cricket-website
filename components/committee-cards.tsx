import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, CallIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

export type Contact = {
  id: number
  role: string
  name: string
  phone: string
  email: string
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function CommitteeCards({ contacts, className }: { contacts: Contact[]; className?: string }) {
  if (contacts.length === 0) {
    return (
      <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
        Committee details will be published soon.
      </p>
    )
  }
  return (
    <div className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {contacts.map((c) => (
        <article
          key={c.id}
          className="group flex flex-col rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/40"
        >
          <div
            aria-hidden
            className="font-heading flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold-pale text-base font-bold tracking-wide text-brand-gold-deep ring-4 ring-brand-gold/20 transition group-hover:ring-brand-gold/40"
          >
            {initials(c.name)}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold-deep">
            {c.role}
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-brand-black">{c.name}</h3>
          {(c.phone || c.email) && (
            <ul className="mt-4 space-y-1 text-sm text-brand-grey">
              {c.phone && (
                <li>
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, '')}`}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md transition hover:text-brand-black"
                  >
                    <HugeiconsIcon icon={CallIcon} className="h-3.5 w-3.5 shrink-0 text-brand-gold-deep" aria-hidden />
                    {c.phone}
                  </a>
                </li>
              )}
              {c.email && (
                <li>
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex min-h-9 items-center gap-2 break-all rounded-md transition hover:text-brand-black"
                  >
                    <HugeiconsIcon icon={Mail01Icon} className="h-3.5 w-3.5 shrink-0 text-brand-gold-deep" aria-hidden />
                    {c.email}
                  </a>
                </li>
              )}
            </ul>
          )}
        </article>
      ))}
    </div>
  )
}
