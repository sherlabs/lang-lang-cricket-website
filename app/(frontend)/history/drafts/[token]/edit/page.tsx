import { notFound } from 'next/navigation'
import { getStoryForEdit } from '@/lib/stories-queries'
import { PageHeader } from '@/components/page-header'
import { DraftEditForm } from './draft-edit-form'
import { getClub } from '@/lib/club'
import { titleWithSuffix } from '@/lib/site-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return {
    title: titleWithSuffix(await getClub(), 'Edit your story'),
    robots: { index: false, follow: false },
  }
}

export default async function DraftEditPage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const [found, club] = await Promise.all([getStoryForEdit(params.token), getClub()])
  if (!found) notFound()
  const { story, authorEmail, contentHtml } = found

  return (
    <main>
      <PageHeader
        eyebrow={club.pageCopy.storyDraftEdit.header.eyebrow}
        title={club.pageCopy.storyDraftEdit.header.title}
        intro={club.pageCopy.storyDraftEdit.header.intro}
      />
      <section className="container-site py-12 lg:py-16">
        <DraftEditForm
          editToken={params.token}
          status={story.status}
          initialTitle={story.title}
          initialAuthorName={story.authorName}
          initialAuthorEmail={authorEmail}
          initialCoverUrl={story.coverImageUrl}
          initialContent={contentHtml}
        />
      </section>
    </main>
  )
}
