import Link from 'next/link'
import type { NewsSummary } from '@/lib/domain'
import { formatNewsDate } from '@/lib/news-format'

/** A news post as a card: cover, date, headline and summary. Used by the feed and the home strip. */
export function NewsCard({ post }: { post: NewsSummary }) {
  return (
    <Link href={`/news/${post.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-brand-black/10 transition hover:ring-brand-gold/60">
      {post.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.coverUrl} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
      ) : (
        <div aria-hidden className="aspect-[16/9] w-full bg-brand-stone" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <time dateTime={post.publishedAt.toISOString()} className="eyebrow">
          {formatNewsDate(post.publishedAt)}
        </time>
        <h3 className="mt-2 text-lg font-bold tracking-tight text-brand-black group-hover:text-brand-gold-deep">{post.title}</h3>
        {post.excerpt && <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-brand-grey">{post.excerpt}</p>}
      </div>
    </Link>
  )
}
