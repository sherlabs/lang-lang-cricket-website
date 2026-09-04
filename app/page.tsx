import Image from 'next/image'
import { db } from '@/db'
import { sponsors, committeeContacts } from '@/db/schema'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const [sponsorRows, contacts] = await Promise.all([
    db.select().from(sponsors),
    db.select().from(committeeContacts),
  ])

  return (
    <main>
      <section className="relative h-[420px] w-full">
        <Image
          src="/assets/branding/hero.jpg"
          alt="Lang Lang Cricket Club"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 flex items-center bg-black/40">
          <div className="mx-auto max-w-3xl px-4 text-white">
            <h1 className="text-4xl font-bold">Lang Lang Cricket Club</h1>
            <p className="mt-3 text-lg">
              A vibrant cricket community in Caldermeade, Victoria — for players of every age.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 leading-relaxed">
        <p>
          Lang Lang Cricket Club is a family-friendly club offering both junior and senior cricket,
          with a strong focus on developing talent and building community. Our state-of-the-art
          facility in Caldermeade is supported by Cardinia Shire and the local Bendigo Bank.
        </p>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 md:grid-cols-4">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="font-semibold">{c.role}</p>
              <p>{c.name}</p>
              {c.phone && <p className="text-sm text-gray-600">{c.phone}</p>}
            </div>
          ))}
        </div>
      </section>

      {sponsorRows.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="mb-6 text-center text-xl font-semibold">Our Sponsors</h2>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {sponsorRows.map((s) => (
              <img key={s.id} src={s.logoUrl} alt={s.name} className="h-16 object-contain" />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
