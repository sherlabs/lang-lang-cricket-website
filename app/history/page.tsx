import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/page-header'

export const metadata = {
  title: 'History | Lang Lang Cricket Club',
}

export default function HistoryPage() {
  return (
    <main>
      <PageHeader
        eyebrow="Our history"
        title="Where the club comes from"
        intro="A community cricket club is the sum of the people who have pulled on the colours over the years. Here is how we are piecing that story back together."
      />

      <section className="container-site grid gap-12 py-16 lg:grid-cols-[1fr_1.2fr] lg:gap-20 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-brand-stone">
          <Image
            src="/assets/gallery/photo-01.jpg"
            alt="Lang Lang Cricket Club players"
            width={1400}
            height={934}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-black/80 to-transparent p-6 text-white">
            <p className="eyebrow text-brand-gold">Caldermeade, Victoria</p>
            <p className="mt-1 font-semibold">Lang Lang Cricket Club</p>
          </div>
        </div>

        <div>
          <blockquote className="border-l-4 border-brand-gold pl-6 text-2xl font-semibold leading-snug tracking-tight text-brand-black sm:text-3xl">
            You cannot make history without knowing where you started.
          </blockquote>

          <div className="mt-10 space-y-5 leading-relaxed text-neutral-700">
            <p>
              Much of the club&apos;s written record had faded or gone missing over the decades. In the
              2022&ndash;23 season that changed: thanks to a generous donation from Josephine Giacco,
              together with the work of the Club Committee, the club&apos;s history records were
              restored and brought back into the clubrooms.
            </p>
            <p>
              Those records now sit alongside a modern home ground in Caldermeade, developed with the
              support of Cardinia Shire Council and Community Bank Lang Lang, giving the next
              generation of juniors and seniors a place to add their own chapter.
            </p>
          </div>

          <div className="mt-10 rounded-2xl bg-brand-gold-pale p-6 ring-1 ring-brand-gold/30">
            <p className="eyebrow">With thanks</p>
            <p className="mt-2 font-bold tracking-tight text-brand-black">
              Josephine Giacco and the Club Committee
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              For restoring the club&apos;s history records in 2022&ndash;23.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-dashed border-brand-black/15 p-6">
            <p className="font-semibold text-brand-black">Got old photos, scorebooks or stories?</p>
            <p className="mt-1 text-sm text-neutral-600">
              We are always keen to add to the archive. Get in touch with the committee and help fill in
              the gaps.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 hover:text-brand-gold-dark"
            >
              Contact the club
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
