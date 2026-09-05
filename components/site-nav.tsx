'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Menu, X, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Home' },
  { href: '/history', label: 'History' },
  { href: '/documents', label: 'Documents & Policies' },
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
        <Link href="/" className="group flex items-center gap-3" onClick={() => setOpen(false)}>
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-white p-1 shadow-sm ring-1 ring-white/20 transition group-hover:ring-brand-gold">
            <Image
              src="/assets/branding/logo.png"
              alt="Lang Lang Cricket Club crest"
              width={36}
              height={45}
              className="h-9 w-auto"
              priority
            />
          </span>
          <span className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">Lang Lang Cricket Club</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gold">
              Caldermeade, Victoria
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-white/75 transition hover:bg-white/5 hover:text-white',
                isActive(l.href) && 'text-brand-gold hover:text-brand-gold'
              )}
            >
              {l.label}
            </Link>
          ))}
          <a
            href="mailto:langlangcricketclub@gmail.com"
            className="ml-2 inline-flex items-center gap-2 rounded-md bg-brand-gold px-3.5 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
          >
            <Mail className="h-4 w-4" aria-hidden />
            Get in touch
          </a>
        </nav>

        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-white transition hover:bg-white/10 md:hidden"
        >
          {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="border-t border-white/10 bg-brand-ink px-5 pb-5 pt-2 md:hidden"
        >
          <div className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'rounded-md px-3 py-3 text-base font-medium text-white/80 transition hover:bg-white/5 hover:text-white',
                  isActive(l.href) && 'text-brand-gold'
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <a
            href="mailto:langlangcricketclub@gmail.com"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-black"
          >
            <Mail className="h-4 w-4" aria-hidden />
            Get in touch
          </a>
        </nav>
      )}
    </header>
  )
}
