'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon, Logout01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { logout } from '@/app/admin/login/actions'

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/documents', label: 'Documents' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/stories', label: 'Stories' },
  { href: '/admin/sponsors', label: 'Sponsors' },
  { href: '/admin/contacts', label: 'Contacts' },
  { href: '/admin/playhq', label: 'PlayHQ' },
]

export function AdminNav() {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-black text-white">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div className="container-site flex items-center justify-between gap-4 py-3">
        <Link href="/admin" className="group flex items-center gap-3 rounded-md" aria-label="Admin dashboard">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white p-1 ring-1 ring-white/20 transition group-hover:ring-brand-gold">
            <Image src="/assets/branding/logo.png" alt="" width={36} height={45} className="h-9 w-auto" priority />
          </span>
          <span className="leading-none">
            <span className="display block text-xl text-white">Lang Lang CC</span>
            <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gold">Admin</span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            aria-label="View site"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md px-3 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
          >
            <span className="hidden sm:inline">View site</span>
            <HugeiconsIcon icon={ArrowUpRight01Icon} className="h-4 w-4" aria-hidden />
          </a>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Log out"
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white"
            >
              <HugeiconsIcon icon={Logout01Icon} className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </form>
        </div>
      </div>

      <nav aria-label="Admin sections" className="container-site -mb-px flex gap-1 overflow-x-auto">
        {links.map((l) => {
          const active = isActive(l.href)
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative min-h-11 shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium text-white/75 transition hover:text-white',
                'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-gold after:opacity-0 after:transition',
                active && 'text-brand-gold after:opacity-100 hover:text-brand-gold'
              )}
            >
              {l.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
