import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getStoryByEditToken } from '@/lib/stories-queries'
import { PageHeader } from '@/components/page-header'
import { DraftEditForm } from './draft-edit-form'

export const dynamic = 'force-dynamic'

export default async function DraftEditPage({ params }: { params: { token: string } }) {
  noStore()
  const story = await getStoryByEditToken(params.token)
  if (!story) notFound()

  return (
    <main>
      <PageHeader eyebrow="Your story" title="Edit your story" intro="Changes save straight back to your submission." />
      <section className="container-site py-12 lg:py-16">
        <DraftEditForm
          editToken={story.editToken}
          status={story.status}
          initialTitle={story.title}
          initialAuthorName={story.authorName}
          initialAuthorEmail={story.authorEmail}
          initialCoverUrl={story.coverImageUrl}
          initialContent={story.contentJson as never}
        />
      </section>
    </main>
  )
}
