import Link from 'next/link'
import type { Metadata } from 'next'
import { PageHeader } from '@/components/page-header'
import { NewsCard } from '@/components/news/news-card'
import { getClub } from '@/lib/club'
import { listPublishedNews } from '@/lib/news-queries'
import { canonicalFor, pageSeo } from '@/lib/site-metadata'

// Reads ?page, so it is per request: a post scheduled for later appears on the list the moment its time comes.
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ page?: string }> }

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: canonicalFor('/news'), ...pageSeo(await getClub(), 'news') }
}

export default async function NewsPage({ searchParams }: Props) {
  const { page: raw } = await searchParams
  const requested = Number.parseInt(raw ?? '1', 10)
  const [club, { items, totalPages, page }] = await Promise.all([getClub(), listPublishedNews(Number.isFinite(requested) ? requested : 1)])
  return (
    <main>
      <PageHeader eyebrow={club.name} title={club.pageCopy.news.title} intro={club.pages.news.description} />
      <section className="container-site py-16 lg:py-20">
        {items.length === 0 ? (
          <p className="text-brand-grey">{club.pageCopy.news.empty}</p>
        ) : (
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((post) => (
              <li key={post.id}>
                <NewsCard post={post} />
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <nav aria-label="News pages" className="mt-12 flex items-center justify-between text-sm font-semibold">
            {page > 1 ? <Link href={page === 2 ? '/news' : `/news?page=${page - 1}`} className="text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4">Newer posts</Link> : <span />}
            <span className="text-brand-grey">Page {page} of {totalPages}</span>
            {page < totalPages ? <Link href={`/news?page=${page + 1}`} className="text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4">Older posts</Link> : <span />}
          </nav>
        )}
      </section>
    </main>
  )
}
