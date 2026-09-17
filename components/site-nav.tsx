'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Menu01Icon, Cancel01Icon, Mail01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Home' },
  { href: '/history', label: 'History' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/documents', label: 'Documents' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/contact', label: 'Contact' },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-black/95 text-white backdrop-blur supports-[backdrop-filter]:bg-brand-black/85">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div className="container-site flex items-center justify-between py-3">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-md"
          onClick={() => setOpen(false)}
          aria-label="Lang Lang Cricket Club home"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-white p-1 shadow-sm ring-1 ring-white/20 transition group-hover:ring-brand-gold">
            <Image
              src="/assets/branding/logo.png"
              alt="Lang Lang Cricket Club crest"
              width={36}
              height={45}
              className="h-9 w-auto"
              priority
            />
          </span>
          <span className="leading-none whitespace-nowrap">
            <span className="display block text-xl text-white transition group-hover:text-brand-gold">
              Lang Lang Cricket Club
            </span>
            <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gold">
              Caldermeade, Victoria
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {links.map((l) => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white xl:px-3',
                  // Gold underline marker on the current page.
                  'after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-brand-gold after:opacity-0 after:transition',
                  active && 'text-brand-gold after:opacity-100 hover:text-brand-gold'
                )}
              >
                {l.label}
              </Link>
            )
          })}
          <a
            href="mailto:langlangcricketclub@gmail.com"
            className="ml-2 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-brand-gold px-3.5 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
          >
            <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
            Get in touch
          </a>
        </nav>

        <button
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-white transition hover:bg-white/10 lg:hidden"
        >
          {open ? (
            <HugeiconsIcon icon={Cancel01Icon} className="h-5 w-5" aria-hidden />
          ) : (
            <HugeiconsIcon icon={Menu01Icon} className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-white/10 bg-brand-ink px-5 pb-5 pt-2 animate-in fade-in-0 slide-in-from-top-2 lg:hidden"
        >
          <div className="flex flex-col">
            {links.map((l) => {
              const active = isActive(l.href)
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center rounded-md border-l-2 border-transparent px-3 py-3 text-base font-medium text-white/85 transition hover:bg-white/5 hover:text-white',
                    active && 'border-brand-gold bg-white/5 text-brand-gold'
                  )}
                >
                  {l.label}
                </Link>
              )
            })}
          </div>
          <a
            href="mailto:langlangcricketclub@gmail.com"
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
          >
            <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
            Get in touch
          </a>
        </nav>
      )}
    </header>
  )
}
