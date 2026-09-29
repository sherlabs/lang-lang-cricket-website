import Link from 'next/link'
import Image from 'next/image'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, MapPinIcon } from '@hugeicons/core-free-icons'
import { FacebookIcon } from '@/components/icons'

// Column 1 mirrors the main nav + Contact, column 2 the Clubhouse group — five links each.
const linkColumns = [
  [
    { href: '/fixtures', label: 'Fixtures' },
    { href: '/events', label: 'Events' },
    { href: '/players', label: 'Players' },
    { href: '/history', label: 'History' },
    { href: '/contact', label: 'Contact' },
  ],
  [
    { href: '/people', label: 'Our People' },
    { href: '/announcements', label: 'Announcements' },
    { href: '/gallery', label: 'Gallery' },
    { href: '/sponsors', label: 'Sponsors' },
    { href: '/documents', label: 'Documents' },
  ],
]

// Desktop column template for the main footer grid.
const columns = 'lg:grid-cols-[1.5fr_1fr_1fr]'

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-brand-black text-white">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div className={`container-site grid gap-10 py-14 sm:grid-cols-2 sm:gap-x-8 lg:gap-x-10 lg:py-16 ${columns}`}>
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="group inline-flex items-center gap-3 rounded-md">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white p-1 ring-1 ring-white/20 transition group-hover:ring-brand-gold">
              <Image
                src="/assets/branding/logo.png"
                alt="Lang Lang Cricket Club crest"
                width={36}
                height={45}
                className="h-10 w-auto"
              />
            </span>
            <span className="leading-none">
              <span className="display block text-xl transition group-hover:text-brand-gold">
                Lang Lang Cricket Club
              </span>
              <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gold">
                Caldermeade, Victoria
              </span>
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/70">
            Junior and senior cricket in Caldermeade, Victoria. New to the game or a seasoned
            player, there is a spot for you on the field.
          </p>
        </div>

        <nav aria-label="Footer">
          <p className="display mb-4 text-lg text-brand-gold">Explore</p>
          {/* Two lists side by side, each reading top-to-bottom in nav order. */}
          <div className="grid grid-cols-2 gap-x-6 text-sm">
            {linkColumns.map((column, i) => (
              <ul key={i}>
                {column.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="inline-flex min-h-9 items-center rounded-sm text-white/80 transition hover:text-brand-gold"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </nav>

        <div>
          <p className="display mb-4 text-lg text-brand-gold">Find us</p>
          <ul className="space-y-1 text-sm">
            <li className="flex min-h-9 items-center gap-2.5 text-white/80">
              <HugeiconsIcon icon={MapPinIcon} className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
              Caldermeade, Victoria, Australia
            </li>
            <li>
              <a
                href="mailto:langlangcricketclub@gmail.com"
                className="flex min-h-9 items-center gap-2.5 rounded-sm text-white/80 transition hover:text-brand-gold"
              >
                <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
                <span className="break-words">langlangcricketclub@gmail.com</span>
              </a>
            </li>
            <li className="flex min-h-9 items-center gap-2.5 text-white/80">
              <FacebookIcon className="h-4 w-4 shrink-0 text-brand-gold" />
              Find us on Facebook for club news
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar: everything left-aligned at the same size, one divider, club line first and the
          build credit last. The credit is subordinate — only "sherlabs.com" carries emphasis (colour, not size). */}
      <div className="border-t border-white/10">
        <div className="container-site flex flex-col py-6 text-xs leading-relaxed text-white/60">
          <p className="flex min-h-9 flex-col justify-center gap-y-1 lg:flex-row lg:items-center lg:justify-start lg:gap-x-3">
            <span className="whitespace-nowrap">
              &copy; {new Date().getFullYear()} Lang Lang Cricket Club. All rights reserved.
            </span>
            <span aria-hidden className="hidden text-white/30 lg:inline">
              ·
            </span>
            <span className="text-balance">Proudly supported by Cardinia Shire Council and Community Bank Lang Lang.</span>
          </p>

          {/* noopener only (no noreferrer) + UTM tags so visits from this credit show up in sherlabs.com analytics. */}
          <a
            href="https://www.sherlabs.com/?utm_source=langlangcricketclub.com&utm_medium=referral&utm_campaign=footer_credit"
            target="_blank"
            rel="noopener"
            className="group mt-2 flex min-h-9 flex-col justify-center gap-y-1 self-start rounded-sm sm:flex-row sm:items-center sm:justify-start sm:gap-x-3 lg:mt-0"
          >
            <span className="whitespace-nowrap">
              Built with{' '}
              <span aria-label="love" role="img" className="inline-block text-rose-500 transition group-hover:scale-110">
                ♥
              </span>{' '}
              by{' '}
              <span className="font-medium text-white/90 underline decoration-brand-gold/60 underline-offset-4 transition group-hover:text-brand-gold group-hover:decoration-brand-gold">
                sherlabs.com
              </span>
            </span>
            <span aria-hidden className="hidden text-white/30 sm:inline">
              ·
            </span>
            <span className="text-white/50 transition group-hover:text-white/70">
              Websites for clubs &amp; local businesses
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
