import { notFound } from 'next/navigation'
import { getPublishedStoryBySlug } from '@/lib/stories-queries'
import { PageHeader } from '@/components/page-header'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const story = await getPublishedStoryBySlug(params.slug)
  return { title: story ? `${story.title} | Lang Lang Cricket Club` : 'Story not found' }
}

export default async function StoryDetailPage({ params }: { params: { slug: string } }) {
  const story = await getPublishedStoryBySlug(params.slug)
  if (!story) notFound()

  return (
    <main>
      <PageHeader
        eyebrow="Our history"
        title={story.title}
        intro={`By ${story.authorName} · ${story.publishedAt?.toLocaleDateString() ?? ''}`}
      />
      <section className="container-site py-16 lg:py-20">
        <div className="mx-auto max-w-2xl">
          {story.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.coverImageUrl} alt="" className="mb-8 aspect-video w-full rounded-2xl object-cover" />
          )}
          {/* eslint-disable-next-line react/no-danger -- content only ever comes from this app's own Tiptap editor, see lib/stories-content.ts */}
          <div className="story-content" dangerouslySetInnerHTML={{ __html: story.contentHtml }} />
        </div>
      </section>
    </main>
  )
}
