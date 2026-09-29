'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Menu01Icon, Cancel01Icon, Mail01Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'

// What a visitor comes to the site for most weeks: always visible on desktop.
const primaryLinks = [
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/events', label: 'Events' },
  { href: '/players', label: 'Players' },
  { href: '/history', label: 'History' },
]

// Around the clubrooms: grouped under a "Clubhouse" disclosure on desktop
// and under a small heading in the mobile menu.
const clubLinks = [
  { href: '/gallery', label: 'Gallery' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/documents', label: 'Documents' },
]

// Home is reachable from the crest on desktop; the mobile menu spells it out.
const mobilePrimaryLinks = [{ href: '/', label: 'Home' }, ...primaryLinks]

const isActivePath = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname.startsWith(href)

// Shared desktop item styling: the gold underline sits on the header's bottom edge.
const desktopItemClass = cn(
  'relative inline-flex items-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5 hover:text-white',
  'after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-brand-gold after:opacity-0 after:transition'
)
const desktopActiveClass = 'text-brand-gold after:opacity-100 hover:text-brand-gold'

export function SiteNav() {
  const [open, setOpen] = useState(false)
  const [clubOpen, setClubOpen] = useState(false)
  const pathname = usePathname()
  const clubRef = useRef<HTMLDivElement>(null)
  const clubButtonRef = useRef<HTMLButtonElement>(null)

  const isActive = (href: string) => isActivePath(pathname, href)
  const clubActive = clubLinks.some((l) => isActive(l.href))

  // Backstop: any navigation closes both menus.
  useEffect(() => {
    setOpen(false)
    setClubOpen(false)
  }, [pathname])

  // Disclosure behaviour for the desktop "Clubhouse" group: click outside, Escape,
  // or tabbing out of the group closes it.
  useEffect(() => {
    if (!clubOpen) return

    const onPointerDown = (e: PointerEvent) => {
      if (clubRef.current && !clubRef.current.contains(e.target as Node)) setClubOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClubOpen(false)
        clubButtonRef.current?.focus()
      }
    }
    const onFocusIn = (e: FocusEvent) => {
      if (clubRef.current && !clubRef.current.contains(e.target as Node)) setClubOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [clubOpen])

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

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {primaryLinks.map((l) => {
            const active = isActive(l.href)
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(desktopItemClass, active && desktopActiveClass)}
              >
                {l.label}
              </Link>
            )
          })}

          <div ref={clubRef} className="relative">
            <button
              ref={clubButtonRef}
              type="button"
              aria-expanded={clubOpen}
              aria-controls="club-menu"
              onClick={() => setClubOpen((o) => !o)}
              className={cn(
                desktopItemClass,
                'cursor-pointer gap-1 pr-2',
                clubActive && desktopActiveClass,
                clubOpen && 'bg-white/5 text-white'
              )}
            >
              Clubhouse
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className={cn('h-4 w-4 transition', clubOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
            {clubOpen && (
              <ul
                id="club-menu"
                className="absolute left-0 top-full mt-[13px] w-48 rounded-md border border-white/10 bg-brand-ink py-1.5 shadow-card-hover animate-in fade-in-0 slide-in-from-top-1"
              >
                {clubLinks.map((l) => {
                  const active = isActive(l.href)
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setClubOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-10 items-center border-l-2 border-transparent px-4 py-2 text-sm font-medium text-white/85 transition hover:bg-white/5 hover:text-white',
                          active && 'border-brand-gold bg-white/5 text-brand-gold'
                        )}
                      >
                        {l.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <Link
            href="/contact"
            aria-current={isActive('/contact') ? 'page' : undefined}
            className="ml-3 inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md bg-brand-gold px-3.5 py-2 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
          >
            <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
            Get in touch
          </Link>
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
            {mobilePrimaryLinks.map((l) => {
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

          <p className="mb-1 mt-4 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gold">
            Clubhouse
          </p>
          <div className="flex flex-col">
            {clubLinks.map((l) => {
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

          <Link
            href="/contact"
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
          >
            <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" aria-hidden />
            Get in touch
          </Link>
        </nav>
      )}
    </header>
  )
}
