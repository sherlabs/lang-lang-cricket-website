import Link from 'next/link'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { getPublishedStoryBySlug } from '@/lib/stories-queries'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  // force-dynamic alone doesn't stop the Neon driver's fetch from being cached by
  // Next's fetch-cache layer — noStore() is required so a rejected/unpublished
  // story's status is never served stale here.
  noStore()
  const story = await getPublishedStoryBySlug(params.slug)
  return { title: story ? `${story.title} | Lang Lang Cricket Club` : 'Story not found' }
}

export default async function StoryDetailPage({ params }: { params: { slug: string } }) {
  // force-dynamic alone doesn't stop the Neon driver's fetch from being cached by
  // Next's fetch-cache layer — noStore() is required so a rejected/unpublished
  // story's status is never served stale here.
  noStore()
  const story = await getPublishedStoryBySlug(params.slug)
  if (!story) notFound()

  return (
    <main className="py-12 lg:py-16">
      <article className="container-site max-w-2xl">
        <Link
          href="/history"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-grey transition hover:text-brand-black"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" aria-hidden />
          Our history
        </Link>

        <h1 className="text-3xl font-bold tracking-tight text-brand-black sm:text-4xl">{story.title}</h1>

        <p className="mt-4 text-sm text-brand-grey">
          By <span className="font-semibold text-brand-charcoal">{story.authorName}</span>
          {story.publishedAt && <> · {story.publishedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</>}
        </p>

        {story.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.coverImageUrl}
            alt=""
            className="-mx-5 mt-8 aspect-[2/1] w-[calc(100%+2.5rem)] object-cover sm:mx-0 sm:w-full sm:rounded-2xl"
          />
        )}

        {/* eslint-disable-next-line react/no-danger -- content only ever comes from this app's own Tiptap editor, see lib/stories-content.ts */}
        <div className="story-content mt-10" dangerouslySetInnerHTML={{ __html: story.contentHtml }} />
      </article>
    </main>
  )
}
