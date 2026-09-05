import { asc } from 'drizzle-orm'
import { Download, FileText, ShieldCheck, ScrollText, ClipboardList, BookOpen, Scale } from 'lucide-react'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { PageHeader } from '@/components/page-header'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Documents & Policies | Lang Lang Cricket Club',
}

const CATEGORY_ORDER = ['Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'CCCA Directory']

const CATEGORY_META: Record<string, { icon: typeof FileText; blurb: string }> = {
  'Codes of Conduct': {
    icon: Scale,
    blurb: 'Expected behaviour for players, parents and juniors across the Cardinia Casey Cricket Association.',
  },
  Policies: {
    icon: ScrollText,
    blurb: 'Cricket Victoria and CCCA policies covering weather, social media, screening and complaints.',
  },
  'Child Safety': {
    icon: ShieldCheck,
    blurb: 'Safeguarding children and young people is a core commitment of the club.',
  },
  'Game Day': {
    icon: ClipboardList,
    blurb: 'Practical checklists for training and match days.',
  },
  'CCCA Directory': {
    icon: BookOpen,
    blurb: 'Association contacts and club listings for the current season.',
  },
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

export default async function DocumentsPage() {
  const rows = await db.select().from(documents).orderBy(asc(documents.title))
  const extra = Array.from(new Set(rows.map((r) => r.category))).filter(
    (c) => !CATEGORY_ORDER.includes(c)
  )
  const categories = [...CATEGORY_ORDER, ...extra]
    .map((cat) => ({ cat, items: rows.filter((r) => r.category === cat) }))
    .filter((c) => c.items.length > 0)

  return (
    <main>
      <PageHeader
        eyebrow="Documents & policies"
        title="Club rules, policies and resources"
        intro="Official Cricket Victoria and Cardinia Casey Cricket Association documents that apply to everyone at Lang Lang. All files open as PDFs."
      >
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
            Documents will be published soon.
          </p>
        )}
        {categories.map(({ cat, items }) => {
          const meta = CATEGORY_META[cat] ?? { icon: FileText, blurb: '' }
          const Icon = meta.icon
          return (
            <section key={cat} id={slug(cat)} className="scroll-mt-28 grid gap-6 lg:grid-cols-[280px_1fr] lg:gap-12">
              <div className="lg:sticky lg:top-28 lg:self-start">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-black text-brand-gold">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="display mt-4 text-3xl text-brand-black sm:text-4xl">{cat}</h2>
                {meta.blurb && <p className="mt-2 text-sm leading-relaxed text-brand-grey">{meta.blurb}</p>}
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
                        <FileText className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-brand-black">{d.title}</span>
                        <span className="block text-xs font-medium uppercase tracking-wider text-brand-grey-light">PDF</span>
                      </span>
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-grey-light transition group-hover:bg-brand-black group-hover:text-brand-gold"
                      >
                        <Download className="h-4 w-4" />
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
