import { db } from '@/db'
import { documents } from '@/db/schema'

export const dynamic = 'force-dynamic'

const CATEGORY_ORDER = ['Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'CCCA Directory']

export default async function DocumentsPage() {
  const rows = await db.select().from(documents)
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Documents & Policies</h1>
      {CATEGORY_ORDER.map((cat) => {
        const items = rows.filter((r) => r.category === cat)
        if (items.length === 0) return null
        return (
          <section key={cat} className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">{cat}</h2>
            <ul className="list-disc space-y-1 pl-6">
              {items.map((d) => (
                <li key={d.id}>
                  <a href={d.url} target="_blank" className="text-emerald-700 underline">
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}
