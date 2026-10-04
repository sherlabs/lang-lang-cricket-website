import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { StoryBody } from '@/components/stories/story-body'
import type { NewsSummary, NewsView } from '@/lib/domain'
import { formatNewsDate } from '@/lib/news-format'

/** One news article with optional previous and next links. Shared by `/news/[slug]` and the staff preview. */
export function ArticleView({ post, clubName, older = null, newer = null }: { post: NewsView; clubName: string; older?: NewsSummary | null; newer?: NewsSummary | null }) {
  return (
    <main className="py-12 lg:py-16">
      <article className="container-site max-w-2xl">
        <Link href="/news" className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-grey transition hover:text-brand-black">
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          All news
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-brand-black sm:text-4xl">{post.title}</h1>
        <p className="mt-4 text-sm text-brand-grey">
          By <span className="font-semibold text-brand-charcoal">{post.author || clubName}</span> ·{' '}
          <time dateTime={post.publishedAt.toISOString()}>{formatNewsDate(post.publishedAt)}</time>
        </p>
        {post.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.coverUrl} alt="" className="-mx-5 mt-8 aspect-[2/1] w-[calc(100%+2.5rem)] object-cover sm:mx-0 sm:w-full sm:rounded-2xl" />
        )}
        <StoryBody content={post.body} className="story-content mt-10" />
        {(older || newer) && (
          <nav aria-label="More news" className="mt-14 grid gap-4 border-t border-brand-black/10 pt-8 sm:grid-cols-2">
            {older ? (
              <Link href={`/news/${older.slug}`} className="group rounded-xl p-4 ring-1 ring-brand-black/10 transition hover:ring-brand-gold">
                <span className="eyebrow">Older</span>
                <span className="mt-1 block font-semibold text-brand-black group-hover:text-brand-gold-deep">{older.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {newer && (
              <Link href={`/news/${newer.slug}`} className="group rounded-xl p-4 text-right ring-1 ring-brand-black/10 transition hover:ring-brand-gold sm:col-start-2">
                <span className="eyebrow inline-flex items-center gap-1">
                  Newer <HugeiconsIcon icon={ArrowRight01Icon} className="h-3 w-3" aria-hidden />
                </span>
                <span className="mt-1 block font-semibold text-brand-black group-hover:text-brand-gold-deep">{newer.title}</span>
              </Link>
            )}
          </nav>
        )}
      </article>
    </main>
  )
}
