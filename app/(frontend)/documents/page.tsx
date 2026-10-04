import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon, FileTextIcon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { getClub } from '@/lib/club'
import { clubIcon } from '@/lib/club-icons'
import { listDocuments } from '@/lib/content-queries'
import { CATEGORY_ORDER } from '@/lib/documents'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/documents'), ...pageSeo(await getClub(), 'documents') }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export default async function DocumentsPage() {
  const [club, rows] = await Promise.all([getClub(), listDocuments()])
  const header = club.pageCopy.documents.header
  const categoryMeta = new Map(club.pageCopy.documentCategories.map((c) => [c.category, c]))
  const extra = Array.from(new Set(rows.map((r) => r.category))).filter(
    (c) => !CATEGORY_ORDER.includes(c)
  )
  const categories = [...CATEGORY_ORDER, ...extra]
    .map((cat) => ({ cat, items: rows.filter((r) => r.category === cat) }))
    .filter((c) => c.items.length > 0)

  return (
    <main>
      <PageHeader eyebrow={header.eyebrow} title={header.title} intro={header.intro}>
        {categories.length > 0 && (
          <nav aria-label="Document categories" className="mt-8 flex flex-wrap gap-2">
            {categories.map(({ cat, items }) => (
              <a
                key={cat}
                href={`#${slug(cat)}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-white/85 transition hover:border-brand-gold hover:text-brand-gold"
              >
                {cat} <span className="text-white/60">({items.length})</span>
              </a>
            ))}
          </nav>
        )}
      </PageHeader>

      <section className="container-site space-y-16 py-16 lg:space-y-20 lg:py-24">
        {categories.length === 0 && (
          <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
            {club.pageCopy.emptyStates.documents}
          </p>
        )}
        {categories.map(({ cat, items }) => {
          const meta = categoryMeta.get(cat)
          const Icon = meta ? clubIcon(meta.icon) : FileTextIcon
          const blurb = meta?.blurb ?? ''
          return (
            <section key={cat} id={slug(cat)} className="scroll-mt-28 grid gap-6 lg:grid-cols-[280px_1fr] lg:gap-12">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30">
                  <HugeiconsIcon icon={Icon} className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="display mt-4 text-3xl text-brand-black sm:text-4xl">{cat}</h2>
                {blurb && <p className="mt-2 text-sm leading-relaxed text-brand-grey">{blurb}</p>}
              </div>
              <ul className="divide-y divide-brand-black/5 overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5">
                {items.map((d) => (
                  <li key={d.id}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-h-[72px] items-center gap-4 px-5 py-4 transition hover:bg-brand-gold-pale focus-visible:bg-brand-gold-pale"
                      aria-label={`${d.title} (PDF, opens in a new tab)`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-stone text-brand-black/70 transition group-hover:bg-white">
                        <HugeiconsIcon icon={FileTextIcon} className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-brand-black">{d.title}</span>
                        <span className="block text-xs font-medium uppercase tracking-wider text-brand-grey-light">PDF</span>
                      </span>
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-grey-light transition group-hover:bg-white group-hover:text-brand-gold-deep"
                      >
                        <HugeiconsIcon icon={Download01Icon} className="h-4 w-4" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </section>
    </main>
  )
}
