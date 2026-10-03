import Link from 'next/link'
import { ClubLogo } from '@/components/club-logo'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, MapPinIcon } from '@hugeicons/core-free-icons'
import { FacebookIcon } from '@/components/icons'
import { agencyCreditHref, AGENCY_CREDIT } from '@/config/site'
import type { Club } from '@/lib/club'

// Desktop column template for the main footer grid.
const columns = 'lg:grid-cols-[1.5fr_1fr_1fr]'

type FooterClub = Pick<Club, 'name' | 'tagline' | 'logoUrl' | 'email' | 'address' | 'socials' | 'siteUrl' | 'navigation'>

export function SiteFooter({ club }: { club: FooterClub }) {
  const nav = club.navigation
  const social = club.socials[0]
  const year = new Date().getFullYear()
  return (
    <footer className="mt-24 bg-brand-black text-white">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div className={`container-site grid gap-10 py-14 sm:grid-cols-2 sm:gap-x-8 lg:gap-x-10 lg:py-16 ${columns}`}>
        <div className="sm:col-span-2 lg:col-span-1">
          <Link href="/" className="group inline-flex items-center gap-3 rounded-md">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white p-1 ring-1 ring-white/20 transition group-hover:ring-brand-gold">
              <ClubLogo
                src={club.logoUrl}
                alt={`${club.name} crest`}
                width={36}
                height={45}
                className="h-10 w-auto"
              />
            </span>
            <span className="leading-none">
              <span className="display block text-xl transition group-hover:text-brand-gold">
                {club.name}
              </span>
              <span className="mt-1 block text-[11px] font-medium uppercase tracking-[0.18em] text-brand-gold">
                {club.tagline}
              </span>
            </span>
          </Link>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/70">{nav.footerBlurb}</p>
        </div>

        <nav aria-label="Footer">
          <p className="display mb-4 text-lg text-brand-gold">{nav.footerNav.heading}</p>
          {/* Two lists side by side, each reading top-to-bottom in nav order. */}
          <div className="grid grid-cols-2 gap-x-6 text-sm">
            {nav.footerNav.columns.map((column, i) => (
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
          <p className="display mb-4 text-lg text-brand-gold">{nav.findUsHeading}</p>
          <ul className="space-y-1 text-sm">
            <li className="flex min-h-9 items-center gap-2.5 text-white/80">
              <HugeiconsIcon icon={MapPinIcon} className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
              {club.address.locality}, {club.address.regionName}, {club.address.countryName}
            </li>
            <li>
              <a
                href={`mailto:${club.email}`}
                className="flex min-h-9 items-center gap-2.5 rounded-sm text-white/80 transition hover:text-brand-gold"
              >
                <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
                <span className="break-words">{club.email}</span>
              </a>
            </li>
            {social &&
              (social.url ? (
                <li>
                  <a
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-9 items-center gap-2.5 rounded-sm text-white/80 transition hover:text-brand-gold"
                  >
                    <FacebookIcon className="h-4 w-4 shrink-0 text-brand-gold" />
                    {social.label}
                    {nav.footerSocialSuffix}
                  </a>
                </li>
              ) : (
                // No URL yet: plain text, as before.
                <li className="flex min-h-9 items-center gap-2.5 text-white/80">
                  <FacebookIcon className="h-4 w-4 shrink-0 text-brand-gold" />
                  {social.label}
                  {nav.footerSocialSuffix}
                </li>
              ))}
          </ul>
        </div>
      </div>

      {/* Bottom bar: everything left-aligned at the same size, one divider, club line first and the
          build credit last. The credit is subordinate — only "sherlabs.com" carries emphasis (colour, not size). */}
      <div className="border-t border-white/10">
        <div className="container-site flex flex-col py-6 text-xs leading-relaxed text-white/60">
          <p className="flex min-h-9 flex-col justify-center gap-y-1 lg:flex-row lg:items-center lg:justify-start lg:gap-x-3">
            <span className="whitespace-nowrap">
              &copy; {year} {nav.copyrightName}. All rights reserved.
            </span>
            <span aria-hidden className="hidden text-white/30 lg:inline">
              ·
            </span>
            <span className="text-balance">{nav.fundingCredit}</span>
          </p>

          {/* noopener only (no noreferrer) + UTM tags so visits from this credit show up in sherlabs.com analytics. */}
          <a
            href={agencyCreditHref(club.siteUrl)}
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
                {AGENCY_CREDIT.name}
              </span>
            </span>
            <span aria-hidden className="hidden text-white/30 sm:inline">
              ·
            </span>
            <span className="text-white/50 transition group-hover:text-white/70">
              {AGENCY_CREDIT.tagline}
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}

