import Link from 'next/link'
import Image from 'next/image'
import { Mail, MapPin } from 'lucide-react'
import { FacebookIcon } from '@/components/icons'

const links = [
  { href: '/history', label: 'History' },
  { href: '/documents', label: 'Documents & Policies' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/contact', label: 'Contact' },
]

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-brand-black text-white">
      <div className="h-1 w-full bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light" />
      <div className="container-site grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-md bg-white p-1">
              <Image src="/assets/branding/logo.png" alt="" width={36} height={45} className="h-10 w-auto" />
            </span>
            <div className="leading-tight">
              <p className="font-bold tracking-tight">Lang Lang Cricket Club</p>
              <p className="text-xs uppercase tracking-[0.18em] text-brand-gold">Caldermeade, Victoria</p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/65">
            Junior and senior cricket in Caldermeade, Victoria. New to the game or a seasoned
            player, there is a spot for you on the field.
          </p>
        </div>

        <div>
          <p className="eyebrow mb-4 text-brand-gold">Explore</p>
          <ul className="space-y-2 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-white/75 transition hover:text-brand-gold">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="eyebrow mb-4 text-brand-gold">Find us</p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5 text-white/75">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
              Caldermeade, Victoria, Australia
            </li>
            <li>
              <a
                href="mailto:langlangcricketclub@gmail.com"
                className="flex items-start gap-2.5 text-white/75 transition hover:text-brand-gold"
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
                langlangcricketclub@gmail.com
              </a>
            </li>
            <li className="flex items-start gap-2.5 text-white/75">
              <FacebookIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
              Find us on Facebook for club news
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-site flex flex-col gap-2 py-5 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Lang Lang Cricket Club. All rights reserved.</p>
          <p>Proudly supported by Cardinia Shire Council and Community Bank Lang Lang.</p>
        </div>
      </div>
    </footer>
  )
}
