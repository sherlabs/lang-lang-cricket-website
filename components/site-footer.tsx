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
      <div className="container-site grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10">
        <div>
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
          <p className="display mb-5 text-lg text-brand-gold">Explore</p>
          <ul className="space-y-1 text-sm">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="inline-flex min-h-9 items-center text-white/80 transition hover:text-brand-gold"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="display mb-5 text-lg text-brand-gold">Find us</p>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5 text-white/80">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
              Caldermeade, Victoria, Australia
            </li>
            <li>
              <a
                href="mailto:langlangcricketclub@gmail.com"
                className="flex items-start gap-2.5 text-white/80 transition hover:text-brand-gold"
              >
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden />
                <span className="break-all">langlangcricketclub@gmail.com</span>
              </a>
            </li>
            <li className="flex items-start gap-2.5 text-white/80">
              <FacebookIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
              Find us on Facebook for club news
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-site flex flex-col gap-2 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Lang Lang Cricket Club. All rights reserved.</p>
          <p>Proudly supported by Cardinia Shire Council and Community Bank Lang Lang.</p>
        </div>
      </div>
    </footer>
  )
}
