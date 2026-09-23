'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createStory } from '../actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadToBlob, optimiseImage } from '@/lib/blob-client'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'
import { Field, TextInput, FileInput, TextArea } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

export default function NewStoryPage() {
  const router = useRouter()
  const [coverUrl, setCoverUrl] = useState('')
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
      await createStory(formData)
      router.push('/admin/stories')
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Could not save the story.')
      setBusy(false)
    }
  }

  return (
    <main>
      <AdminPageHeader eyebrow="Stories" title="New story" intro="Publishes immediately." />
      <AdminCard>
        <form action={onSubmit} className="flex flex-col gap-5">
          <Field label="Title" htmlFor="story-title">
            <TextInput id="story-title" name="title" required />
          </Field>
          <Field label="Author name" htmlFor="story-author" hint="Defaults to the club if left blank.">
            <TextInput id="story-author" name="authorName" placeholder="Lang Lang Cricket Club" />
          </Field>
          <Field label="Excerpt" htmlFor="story-excerpt" hint="Optional — auto-generated from the body if left blank.">
            <TextArea id="story-excerpt" name="excerpt" />
          </Field>
          <Field label="Cover image" htmlFor="story-cover" hint="Optional.">
            <FileInput id="story-cover" accept="image/*" onChange={onCoverChange} />
          </Field>
          <Field label="Story" htmlFor="story-body">
            <StoryEditor name="contentJson" uploadImage={(file) => uploadToBlob(file, 'stories')} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </form>
      </AdminCard>
    </main>
  )
}
