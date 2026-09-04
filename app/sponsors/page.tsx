import { db } from '@/db'
import { sponsors } from '@/db/schema'

export const dynamic = 'force-dynamic'

const TIERS = ['Platinum', 'Gold', 'Silver', 'Bronze']

export default async function SponsorsPage() {
  const rows = await db.select().from(sponsors)
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Sponsors & Partners</h1>
      {TIERS.map((tier) => {
        const items = rows.filter((s) => s.tier === tier)
        if (items.length === 0) return null
        return (
          <section key={tier} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">{tier} Sponsors</h2>
            <div className="flex flex-wrap items-center gap-8">
              {items.map((s) =>
                s.linkUrl ? (
                  <a key={s.id} href={s.linkUrl} target="_blank">
                    <img src={s.logoUrl} alt={s.name} className="h-20 object-contain" />
                  </a>
                ) : (
                  <img key={s.id} src={s.logoUrl} alt={s.name} className="h-20 object-contain" />
                )
              )}
            </div>
          </section>
        )
      })}
    </main>
  )
}
