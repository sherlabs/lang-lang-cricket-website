import Link from 'next/link'
import { getClub } from '@/lib/club'
import { listPeople } from '@/lib/people-queries'
import { groupPeople } from '@/lib/people'
import { PageHeader } from '@/components/page-header'
import { PeopleGrid } from '@/components/person-card'
import { SectionHeading } from '@/components/section-heading'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/people'), ...pageSeo(await getClub(), 'people') }
}

export default async function PeoplePage() {
  const [club, rows] = await Promise.all([getClub(), listPeople()])
  const groups = groupPeople(rows)
  const header = club.pageCopy.people.header
  const sectionCopy = new Map(club.pageCopy.peopleSections.map((s) => [s.key as string, s]))

  return (
    <main>
      <PageHeader eyebrow={header.eyebrow} title={header.title} intro={header.intro} />

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
          {groups.map((g) => {
            const copy = sectionCopy.get(g.key)
            const label = copy?.label ?? g.label
            return (
            <section key={g.key} className="py-16 lg:py-20" aria-label={label}>
              <SectionHeading eyebrow={label} title={copy?.heading ?? label} intro={copy?.intro} />
              <PeopleGrid people={g.people} className="mt-12" />
            </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
