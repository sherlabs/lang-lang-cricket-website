import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getStoryByViewToken } from '@/lib/stories-queries'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  published: 'Published',
  rejected: 'Not approved',
}

export default async function DraftViewPage({ params }: { params: { token: string } }) {
  noStore()
  const story = await getStoryByViewToken(params.token)
  if (!story) notFound()

  return (
    <main className="py-12 lg:py-16">
      <article className="container-site max-w-2xl">
        <span className="inline-flex rounded-full bg-brand-stone px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-grey">
          Preview · {STATUS_LABEL[story.status] ?? story.status}
        </span>

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-brand-black sm:text-4xl">{story.title}</h1>

        <p className="mt-4 text-sm text-brand-grey">
          By <span className="font-semibold text-brand-charcoal">{story.authorName}</span>
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
