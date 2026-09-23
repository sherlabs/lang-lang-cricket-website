import { notFound } from 'next/navigation'
import { getStoryById } from '../../actions'
import { EditStoryForm } from './edit-story-form'

export default async function EditStoryPage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  const story = await getStoryById(id)
  if (!story) notFound()

  return (
    <main>
      <EditStoryForm
        id={story.id}
        initialTitle={story.title}
        initialAuthorName={story.authorName}
        initialExcerpt={story.excerpt}
        initialCoverUrl={story.coverImageUrl}
        initialContent={story.contentJson as never}
      />
    </main>
  )
}
