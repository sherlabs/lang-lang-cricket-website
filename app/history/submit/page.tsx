'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { submitStory } from './actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadPublicStoryImage, optimiseImage } from '@/lib/blob-client'
import { PageHeader } from '@/components/page-header'
import { Field, TextInput, FileInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

export default function SubmitStoryPage() {
  const params = useSearchParams()
  const submitted = params.get('submitted') === '1'
  const [coverUrl, setCoverUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await optimiseImage(file, { maxEdge: 1600 })
    setCoverUrl(await uploadPublicStoryImage(prepared))
  }

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    formData.set('coverImageUrl', coverUrl)
    try {
      await submitStory(formData)
    } catch (err) {
      // next/navigation's redirect() throws on success too — only treat a
      // real Error (our own validation) as a failure to show.
      if (err instanceof Error && !('digest' in err)) {
        setError(err.message)
        setBusy(false)
      }
    }
  }

  if (submitted) {
    return (
      <main>
        <PageHeader
          eyebrow="Your story"
          title="Thanks for sharing"
          intro="A committee member will review your story before it goes live on the history page."
        />
      </main>
    )
  }

  return (
    <main>
      <PageHeader
        eyebrow="Your story"
        title="Share your story"
        intro="Old photos, scorebooks, match reports, memories from the clubrooms — tell us your Lang Lang story. A committee member reviews every submission before it appears on the site."
      />
      <section className="container-site py-16 lg:py-20">
        <form action={onSubmit} className="mx-auto flex max-w-2xl flex-col gap-5">
          <Field label="Your name" htmlFor="submit-name">
            <TextInput id="submit-name" name="authorName" required />
          </Field>
          <Field label="Email" htmlFor="submit-email" hint="Optional — only so we can follow up if needed.">
            <TextInput id="submit-email" name="authorEmail" type="email" />
          </Field>
          <Field label="Title" htmlFor="submit-title">
            <TextInput id="submit-title" name="title" required />
          </Field>
          <Field label="Cover image" htmlFor="submit-cover" hint="Optional.">
            <FileInput id="submit-cover" accept="image/*" onChange={onCoverChange} />
          </Field>
          <Field label="Your story" htmlFor="submit-body">
            <StoryEditor name="contentJson" uploadImage={uploadPublicStoryImage} />
          </Field>

          {/* Honeypot: hidden from real visitors via CSS, not `type="hidden"`, so form-filling bots that target visible inputs still fill it. */}
          <div aria-hidden className="absolute -left-[9999px]" tabIndex={-1}>
            <label htmlFor="submit-website">Website</label>
            <input id="submit-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}
