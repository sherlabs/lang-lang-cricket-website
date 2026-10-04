import { JsonLd } from '@/components/json-ld'
import { storyJsonLd } from '@/lib/structured-data'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StoryBody } from '@/components/stories/story-body'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { getPublishedStoryBySlug } from '@/lib/stories-queries'
import { baseOpenGraph, truncateDescription, canonicalFor, titleWithSuffix } from "@/lib/site-metadata"
import { getClub } from '@/lib/club'
import { getClubWithCrest } from '@/lib/theme'

export const dynamic = 'force-dynamic'

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const [club, story] = await Promise.all([getClub(), getPublishedStoryBySlug(params.slug)])
  if (!story) return { title: 'Story not found' }
  const og = baseOpenGraph(club)
  return {
    alternates: canonicalFor(`/history/${story.slug}`),
    title: titleWithSuffix(club, story.title),
    description: truncateDescription(story.excerpt) || `A story from the history of ${club.name}, shared by ${story.authorName}.`,
    openGraph: {
      ...og,
      type: 'article',
      images: story.coverImageUrl ? [{ url: story.coverImageUrl, alt: story.title }] : og.images,
      ...(story.publishedAt ? { publishedTime: story.publishedAt.toISOString() } : {}),
    },
  }
}

export default async function StoryDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const [club, story] = await Promise.all([getClubWithCrest(), getPublishedStoryBySlug(params.slug)])
  if (!story) notFound()

  return (
    <main className="py-12 lg:py-16">
      <JsonLd data={storyJsonLd(story, club)} />
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

        <StoryBody content={story.content} className="story-content mt-10" />
      </article>
    </main>
  )
}
