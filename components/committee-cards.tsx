import { Mail, Phone } from 'lucide-react'
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
    return <p className="text-sm text-neutral-500">Committee details will be published soon.</p>
  }
  return (
    <div className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-4', className)}>
      {contacts.map((c) => (
        <article
          key={c.id}
          className="group flex flex-col rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-black text-sm font-bold text-brand-gold ring-4 ring-brand-gold/20">
            {initials(c.name)}
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold-dark">
            {c.role}
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-brand-black">{c.name}</h3>
          {(c.phone || c.email) && (
            <ul className="mt-4 space-y-1.5 text-sm text-neutral-600">
              {c.phone && (
                <li>
                  <a href={`tel:${c.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-2 hover:text-brand-black">
                    <Phone className="h-3.5 w-3.5 text-brand-gold-dark" aria-hidden />
                    {c.phone}
                  </a>
                </li>
              )}
              {c.email && (
                <li>
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-2 break-all hover:text-brand-black">
                    <Mail className="h-3.5 w-3.5 text-brand-gold-dark" aria-hidden />
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
