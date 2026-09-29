import { unstable_noStore as noStore } from 'next/cache'
import { PageHeader } from '@/components/page-header'
import { listPublishedAnnouncements } from '@/lib/announcements-queries'
import { bodyParagraphs, formatAnnouncementDate } from '@/lib/announcements-format'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Announcements | Lang Lang Cricket Club',
}

export default async function AnnouncementsPage() {
  noStore()
  const items = await listPublishedAnnouncements()

  return (
    <main>
      <PageHeader
        eyebrow="Clubhouse"
        title="Announcements"
        intro="Club notices, in one place — training changes, working bees, presentation nights and anything else the committee needs you to know."
      />
      <section className="container-site py-16 lg:py-20">
        {items.length === 0 ? (
          <p className="text-brand-grey">Nothing to announce right now — check back soon.</p>
        ) : (
          <div className="mx-auto max-w-3xl divide-y divide-brand-black/10">
            {items.map((a) => {
              const paragraphs = bodyParagraphs(a.body)
              return (
                // scroll-mt clears the sticky nav when arriving via /announcements#announcement-<id>;
                // the :target one gets a gold rule and tint so the linked notice is obvious.
                <article
                  key={a.id}
                  id={`announcement-${a.id}`}
                  className="-mx-4 scroll-mt-28 rounded-r-xl border-l-2 border-transparent px-4 py-8 transition first:pt-0 last:pb-0 target:border-brand-gold target:bg-brand-gold-pale/60 target:first:pt-8 target:last:pb-8 sm:-mx-6 sm:px-6"
                >
                  <time
                    dateTime={a.createdAt.toISOString()}
                    className="eyebrow block"
                  >
                    {formatAnnouncementDate(a.createdAt)}
                  </time>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-brand-black sm:text-3xl">{a.title}</h2>
                  {paragraphs.length > 0 && (
                    <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-brand-charcoal">
                      {paragraphs.map((p, i) => (
                        <p key={i} className="whitespace-pre-line">
                          {p}
                        </p>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
