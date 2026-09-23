'use client'

import { useSearchParams } from 'next/navigation'
import { useRef, useState, Suspense } from 'react'
import { submitStory } from './actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadPublicStoryImage, optimiseImage } from '@/lib/blob-client'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'

function SubmitStoryForm() {
  const params = useSearchParams()
  const submitted = params.get('submitted') === '1'
  const coverInputRef = useRef<HTMLInputElement>(null)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverBusy, setCoverBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverBusy(true)
    try {
      const prepared = await optimiseImage(file, { maxEdge: 1600 })
      setCoverUrl(await uploadPublicStoryImage(prepared))
    } finally {
      setCoverBusy(false)
    }
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
      <section className="container-site py-12 lg:py-16">
        <form action={onSubmit} className="mx-auto flex max-w-2xl flex-col">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="-mx-5 mb-8 aspect-[2/1] w-[calc(100%+2.5rem)] object-cover sm:mx-0 sm:w-full sm:rounded-2xl" />
          ) : null}

          <input
            type="text"
            name="title"
            required
            placeholder="Title"
            className="story-title-input"
            aria-label="Title"
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-brand-black/10 pb-6 text-sm text-brand-grey">
            <label className="flex items-center gap-1.5">
              By
              <input
                type="text"
                name="authorName"
                required
                placeholder="Your name"
                className="w-40 border-0 border-b border-dashed border-brand-black/20 bg-transparent py-0.5 text-brand-black placeholder:text-brand-grey-light focus:border-brand-gold focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Email (optional)
              <input
                type="email"
                name="authorEmail"
                placeholder="you@example.com"
                className="w-48 border-0 border-b border-dashed border-brand-black/20 bg-transparent py-0.5 text-brand-black placeholder:text-brand-grey-light focus:border-brand-gold focus:outline-none"
              />
            </label>
            <button
              type="button"
              disabled={coverBusy}
              onClick={() => coverInputRef.current?.click()}
              className="text-brand-gold-deep underline decoration-brand-gold decoration-2 underline-offset-2 hover:text-brand-black"
            >
              {coverBusy ? 'Uploading…' : coverUrl ? 'Change cover image' : '+ Add cover image'}
            </button>
            <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverChange} />
          </div>

          <StoryEditor name="contentJson" uploadImage={uploadPublicStoryImage} />

          {/* Honeypot: hidden from real visitors via CSS, not `type="hidden"`, so form-filling bots that target visible inputs still fill it. */}
          <div aria-hidden className="absolute -left-[9999px]" tabIndex={-1}>
            <label htmlFor="submit-website">Website</label>
            <input id="submit-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {error && (
            <p role="alert" className="mt-6 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-8 border-t border-brand-black/10 pt-6">
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}

export default function SubmitStoryPage() {
  return (
    <Suspense fallback={null}>
      <SubmitStoryForm />
    </Suspense>
  )
}
