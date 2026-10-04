import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { NewsCard } from '@/components/news/news-card'
import type { NewsSummary } from '@/lib/domain'

/** The latest posts on the home page. Copy comes from the club's `pageCopy.news.strip`. Renders nothing when there are none, so a club with no news sees no empty section. */
export function NewsStrip({ posts, copy }: { posts: NewsSummary[]; copy: { eyebrow: string; title: string; ctaLabel: string } }) {
  if (posts.length === 0) return null
  return (
    <section className="container-site pb-20 lg:pb-28" aria-labelledby="home-news-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h2 id="home-news-heading" className="display mt-3 text-balance text-4xl text-brand-black sm:text-5xl">
            {copy.title}
          </h2>
        </div>
        <Link
          href="/news"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep"
        >
          {copy.ctaLabel}
          <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <li key={post.id}>
            <NewsCard post={post} />
          </li>
        ))}
      </ul>
    </section>
  )
}
