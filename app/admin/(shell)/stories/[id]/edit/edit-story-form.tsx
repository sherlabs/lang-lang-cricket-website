'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JSONContent } from '@tiptap/core'
import { updateStory } from '../../actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadToBlob, optimiseImage } from '@/lib/blob-client'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'
import { Field, TextInput, FileInput, TextArea } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

type Props = {
  id: number
  initialTitle: string
  initialAuthorName: string
  initialExcerpt: string
  initialCoverUrl: string
  initialContent: JSONContent
}

export function EditStoryForm({ id, initialTitle, initialAuthorName, initialExcerpt, initialCoverUrl, initialContent }: Props) {
  const router = useRouter()
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await optimiseImage(file, { maxEdge: 1600 })
    setCoverUrl(await uploadToBlob(prepared, 'stories'))
  }

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    formData.set('coverImageUrl', coverUrl)
    try {
      await updateStory(id, formData)
      router.push('/admin/stories')
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Could not save the story.')
      setBusy(false)
    }
  }

  return (
    <>
      <AdminPageHeader eyebrow="Stories" title="Edit story" />
      <AdminCard>
        <form action={onSubmit} className="flex flex-col gap-5">
          <Field label="Title" htmlFor="story-title">
            <TextInput id="story-title" name="title" defaultValue={initialTitle} required />
          </Field>
          <Field label="Author name" htmlFor="story-author">
            <TextInput id="story-author" name="authorName" defaultValue={initialAuthorName} />
          </Field>
          <Field label="Excerpt" htmlFor="story-excerpt">
            <TextArea id="story-excerpt" name="excerpt" defaultValue={initialExcerpt} />
          </Field>
          <Field label="Cover image" htmlFor="story-cover">
            <FileInput id="story-cover" accept="image/*" onChange={onCoverChange} />
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="mt-2 aspect-video w-full max-w-sm rounded-lg object-cover" />
            )}
          </Field>
          <Field label="Story" htmlFor="story-body">
            <StoryEditor name="contentJson" initialContent={initialContent} uploadImage={(file) => uploadToBlob(file, 'stories')} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </AdminCard>
    </>
  )
}
