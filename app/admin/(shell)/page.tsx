import Link from 'next/link'
import { count } from 'drizzle-orm'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUpRight01Icon, Award01Icon, ContactBookIcon, File02Icon, Image02Icon } from '@hugeicons/core-free-icons'
import { db } from '@/db'
import { committeeContacts, documents, galleryPhotos, sponsors } from '@/db/schema'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'
import { PlayHQRefreshForm } from '@/components/admin/playhq-refresh-form'

export const dynamic = 'force-dynamic'

async function countRows(table: typeof documents | typeof galleryPhotos | typeof sponsors | typeof committeeContacts) {
  const [row] = await db.select({ n: count() }).from(table)
  return row?.n ?? 0
}

export default async function AdminDashboard() {
  const [docs, photos, sponsorCount, contacts] = await Promise.all([
    countRows(documents),
    countRows(galleryPhotos),
    countRows(sponsors),
    countRows(committeeContacts),
  ])

  const stats = [
    { href: '/admin/documents', label: 'Documents', value: docs, icon: File02Icon, note: 'PDFs on the Documents page' },
    { href: '/admin/gallery', label: 'Photos', value: photos, icon: Image02Icon, note: 'First six show on the homepage' },
    { href: '/admin/sponsors', label: 'Sponsors', value: sponsorCount, icon: Award01Icon, note: 'Logos by tier' },
    { href: '/admin/contacts', label: 'Contacts', value: contacts, icon: ContactBookIcon, note: 'Committee and leadership' },
  ]

  return (
    <main>
      <AdminPageHeader
        eyebrow="Dashboard"
        title="Lang Lang Cricket Club"
        intro="Everything you change here is live on the public site straight away."
      />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="group flex h-full flex-col rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30">
                <HugeiconsIcon icon={s.icon} className="h-5 w-5" aria-hidden />
              </span>
              <span className="display mt-5 text-5xl text-brand-black">{s.value}</span>
              <span className="mt-1 text-base font-semibold text-brand-black">{s.label}</span>
              <span className="mt-1 text-sm text-brand-grey">{s.note}</span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-gold-deep group-hover:underline">
                Manage
                <HugeiconsIcon icon={ArrowUpRight01Icon} className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AdminCard
          title="PlayHQ"
          description="Fixtures, results and ladders refresh on their own every 30 minutes. Refresh now if results were just entered."
          aside={
            <Link href="/admin/playhq" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-gold-deep hover:underline">
              Details
            </Link>
          }
        >
          <PlayHQRefreshForm />
        </AdminCard>

        <AdminCard title="How this site works">
          <ul className="grid gap-3 text-sm text-brand-grey">
            <li>Documents, photos, sponsors and contacts are read from the database on every visit, so saves are visible immediately.</li>
            <li>Fixtures, results and scorecards come from PlayHQ and are cached for up to 30 minutes.</li>
            <li>Files you upload are stored with the site host; deleting an item also removes its file.</li>
          </ul>
        </AdminCard>
      </div>
    </main>
  )
}
