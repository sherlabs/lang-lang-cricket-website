import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { db } from '@/db'
import { committeeContacts } from '@/db/schema'
import { groupPeople, type Section } from '@/lib/people'
import { PageHeader } from '@/components/page-header'
import { CommitteeCards } from '@/components/committee-cards'
import { SectionHeading } from '@/components/section-heading'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Our People | Lang Lang Cricket Club',
}

const SECTION_COPY: Record<Section, { title: string; intro: string }> = {
  leadership: {
    title: 'Leading our senior program',
    intro: 'The group responsible for selection, coaching and the direction of our senior sides.',
  },
  committee: {
    title: 'Meet the committee',
    intro:
      'The volunteers who keep the club running, on and off the field. Our Child Safety Officer is your first point of contact for any safeguarding concern.',
  },
  coach: {
    title: 'Coaching our juniors',
    intro: 'The coaches who look after our junior squads each week, from first-time players through to the older age groups.',
  },
}

export default async function PeoplePage() {
  noStore()
  const rows = await db.select().from(committeeContacts)
  const groups = groupPeople(rows)

  return (
    <main>
      <PageHeader
        eyebrow="Clubhouse"
        title="Our People"
        intro="Lang Lang is run by volunteers: the committee, the senior leadership team and the coaches who give their weekends to our juniors. Here is who they are and how to reach them."
      />

      {groups.length === 0 ? (
        <section className="container-site py-16 lg:py-20">
          <p className="rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light">
            Details of our people will be published soon. In the meantime, you can reach the club through the{' '}
            <Link href="/contact" className="font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4">
              Contact
            </Link>{' '}
            page.
          </p>
        </section>
      ) : (
        <div className="container-site divide-y divide-brand-black/5">
          {groups.map((g) => (
            <section key={g.key} className="py-16 lg:py-20" aria-label={g.label}>
              <SectionHeading eyebrow={g.label} title={SECTION_COPY[g.key].title} intro={SECTION_COPY[g.key].intro} />
              <CommitteeCards contacts={g.people} className="mt-12" />
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
