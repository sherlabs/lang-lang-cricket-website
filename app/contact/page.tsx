import { db } from '@/db'
import { committeeContacts } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

export default async function ContactPage() {
  const contacts = await db.select().from(committeeContacts).orderBy(asc(committeeContacts.sortOrder))
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Contact</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {contacts.map((c) => (
          <div key={c.id} className="rounded-lg border p-4">
            <p className="font-semibold">{c.role}</p>
            <p>{c.name}</p>
            {c.phone && <p className="text-sm text-gray-600">Ph. {c.phone}</p>}
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-sm text-emerald-700 underline">
                {c.email}
              </a>
            )}
          </div>
        ))}
      </div>
      <p className="mt-8 text-gray-700">
        Caldermeade, Victoria — follow us on Facebook for match schedules and updates.
      </p>
    </main>
  )
}
