import Image from 'next/image'
import Link from 'next/link'
import { unstable_noStore as noStore } from 'next/cache'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, PencilEdit01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { buttonVariants } from '@/components/ui/button'
import { listPublishedStories } from '@/lib/stories-queries'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'History | Lang Lang Cricket Club',
}

export default async function HistoryPage() {
  // force-dynamic alone doesn't stop the Neon driver's fetch from being cached by
  // Next's fetch-cache layer — noStore() is required so a rejected/unpublished
  // story's status is never served stale here.
  noStore()
  const stories = await listPublishedStories()

  return (
    <main>
      <PageHeader
        eyebrow="Our history"
        title="Where the club comes from"
        intro="A community cricket club is the sum of the people who have pulled on the colours over the years. Here is how we are piecing that story back together."
      />

      <section className="container-site grid gap-12 py-16 lg:grid-cols-[1fr_1.2fr] lg:items-start lg:gap-20 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-brand-stone shadow-card ring-1 ring-brand-black/5 lg:sticky lg:top-28">
          <Image
            src="/assets/gallery/photo-01.jpg"
            alt="Lang Lang Cricket Club players on the field at Caldermeade"
            width={1400}
            height={934}
            className="aspect-[3/2] h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-black/80 to-transparent p-6 text-white">
            <p className="eyebrow text-brand-gold">Caldermeade, Victoria</p>
            <p className="display mt-1 text-2xl">Lang Lang Cricket Club</p>
          </div>
        </div>

        <div>
          <blockquote className="font-heading border-l-4 border-brand-gold pl-6 text-3xl font-semibold leading-tight text-brand-black sm:text-4xl lg:text-5xl">
            You cannot make history without knowing where you started.
          </blockquote>

          <div className="mt-10 space-y-5 leading-relaxed text-brand-charcoal">
            <p>
              Much of the club&apos;s written record had faded or gone missing over the decades. In the
              2022&ndash;23 season that changed: through the work of the Club Committee, the
              club&apos;s history records were restored and brought back into the clubrooms.
            </p>
            <p>
              Those records now sit alongside a modern home ground in Caldermeade, developed with the
              support of Cardinia Shire Council and Community Bank Lang Lang, giving the next
              generation of juniors and seniors a place to add their own chapter.
            </p>
          </div>

          <div className="mt-10 rounded-2xl bg-brand-gold-pale p-6 ring-1 ring-brand-gold/30">
            <p className="eyebrow">With thanks</p>
            <p className="display mt-2 text-2xl text-brand-black">
              The Club Committee
            </p>
            <p className="mt-2 text-sm text-brand-charcoal">
              For restoring the club&apos;s history records in 2022&ndash;23.
            </p>
          </div>

        </div>
      </section>

      <section className="container-site pb-16 lg:pb-20">
        <div className="relative overflow-hidden rounded-3xl bg-brand-black px-6 py-12 text-center text-white sm:px-12 sm:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full bg-brand-gold/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-xl">
            <p className="eyebrow text-brand-gold">Got old photos, scorebooks or stories?</p>
            <p className="display mt-3 text-3xl sm:text-4xl">Write your story</p>
            <p className="mt-4 text-base leading-relaxed text-white/75">
              Every era of the club deserves its chapter. Whatever you remember, however you want to
              tell it — write it up and share it with the club.
            </p>
            <Link
              href="/history/submit"
              className={buttonVariants({ variant: 'gold', size: 'xl', className: 'mt-8 gap-2' })}
            >
              <HugeiconsIcon icon={PencilEdit01Icon} className="h-4 w-4" aria-hidden />
              Write your story
              <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {stories.length > 0 && (
        <section className="container-site py-16 lg:py-20">
          <div className="mb-8 flex items-center gap-3">
            <span className="display text-2xl text-brand-black">Stories</span>
            <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/history/${story.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover"
              >
                {story.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={story.coverImageUrl}
                    alt=""
                    className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
                  />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">
                    {story.publishedAt?.toLocaleDateString()}
                  </p>
                  <h3 className="font-heading text-lg font-bold text-brand-black">{story.title}</h3>
                  <p className="line-clamp-3 text-sm text-brand-grey">{story.excerpt}</p>
                  <p className="mt-auto text-xs text-brand-grey-light">By {story.authorName}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
