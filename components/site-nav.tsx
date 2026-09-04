import Link from 'next/link'
import Image from 'next/image'

const links = [
  { href: '/', label: 'Home' },
  { href: '/history', label: 'History' },
  { href: '/documents', label: 'Documents & Policies' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/contact', label: 'Contact' },
]

export function SiteNav() {
  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Image src="/assets/branding/logo.png" alt="Lang Lang Cricket Club" width={40} height={50} />
          Lang Lang Cricket Club
        </Link>
        <nav className="hidden gap-5 text-sm font-medium md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-emerald-700">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
