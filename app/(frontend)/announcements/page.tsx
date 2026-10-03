import { PageHeader } from '@/components/page-header'
import { listPublishedAnnouncements } from '@/lib/announcements-queries'
import { bodyParagraphs, formatAnnouncementDate } from '@/lib/announcements-format'
import { getClub } from '@/lib/club'
import { canonicalFor, pageSeo } from "@/lib/site-metadata"

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { alternates: canonicalFor('/announcements'), ...pageSeo(await getClub(), 'announcements') }
}

export default async function AnnouncementsPage() {
  const [club, items] = await Promise.all([getClub(), listPublishedAnnouncements()])
  const header = club.pageCopy.announcements.header

  return (
    <main>
      <PageHeader eyebrow={header.eyebrow} title={header.title} intro={header.intro} />
      <section className="container-site py-16 lg:py-20">
        {items.length === 0 ? (
          <p className="text-brand-grey">{club.pageCopy.emptyStates.announcements}</p>
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
