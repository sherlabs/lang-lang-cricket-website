import Link from 'next/link'

const links = [
  { href: '/admin/documents', label: 'Documents' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/sponsors', label: 'Sponsors' },
  { href: '/admin/contacts', label: 'Contacts' },
  { href: '/admin/fixtures', label: 'Fixtures' },
]

export function AdminNav() {
  return (
    <nav className="flex gap-4 border-b p-4">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm font-medium hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
