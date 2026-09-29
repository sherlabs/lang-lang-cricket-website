import Link from 'next/link'
import Image from 'next/image'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, MapPinIcon } from '@hugeicons/core-free-icons'
import { FacebookIcon } from '@/components/icons'

const links = [
  { href: '/history', label: 'History' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/events', label: 'Events' },
  { href: '/documents', label: 'Documents' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/contact', label: 'Contact' },
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
          {/* Two columns read top-to-bottom (grid-flow-col) so the order matches the nav. */}
          <ul className="grid grid-flow-col grid-cols-2 grid-rows-4 gap-x-6 text-sm">
            {links.map((l) => (
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

      <div className="border-t border-white/10">
        <div className="container-site py-5 text-xs leading-relaxed text-white/60">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
            <p>&copy; {new Date().getFullYear()} Lang Lang Cricket Club. All rights reserved.</p>
            <p className="text-balance">Proudly supported by Cardinia Shire Council and Community Bank Lang Lang.</p>
          </div>

          {/* noopener only (no noreferrer) + UTM tags so visits from this credit show up in sherlabs.com analytics. */}
          <a
            href="https://www.sherlabs.com/?utm_source=langlangcricketclub.com&utm_medium=referral&utm_campaign=footer_credit"
            target="_blank"
            rel="noopener"
            className="group mt-4 flex min-h-9 flex-col justify-center gap-0.5 rounded-sm border-t border-white/5 pt-4 transition hover:text-white/80 lg:flex-row lg:items-center lg:justify-between lg:gap-10"
          >
            <span className="whitespace-nowrap text-white/80">
              Built with{' '}
              <span aria-label="love" role="img" className="inline-block text-rose-500 transition group-hover:scale-110">
                ♥
              </span>{' '}
              by{' '}
              <span className="font-semibold text-white underline decoration-brand-gold/60 underline-offset-4 transition group-hover:text-brand-gold group-hover:decoration-brand-gold">
                sherlabs.com
              </span>
            </span>
            <span>
              Websites for clubs &amp; local businesses{' '}
              <span aria-hidden className="inline-block transition group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
