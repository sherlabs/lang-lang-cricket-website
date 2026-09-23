'use client'

import { useSearchParams } from 'next/navigation'
import { useRef, useState, Suspense } from 'react'
import { submitStory } from './actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadPublicStoryImage, optimiseImage } from '@/lib/blob-client'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserIcon, ImageAdd01Icon, Camera01Icon } from '@hugeicons/core-free-icons'

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
    const result = await submitStory(formData)
    if (result?.error) {
      setError(result.error)
      setBusy(false)
    }
    // no result / redirect: Next's redirect() already navigated away, nothing to do here
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
            <div className="group relative -mx-5 mb-8 overflow-hidden sm:mx-0 sm:rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverUrl} alt="" className="aspect-[2/1] w-full object-cover" />
              <button
                type="button"
                disabled={coverBusy}
                onClick={() => coverInputRef.current?.click()}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brand-black/80 px-3 py-1.5 text-xs font-semibold text-white shadow-card backdrop-blur transition hover:bg-brand-black disabled:opacity-60"
              >
                <HugeiconsIcon icon={Camera01Icon} className="h-3.5 w-3.5" aria-hidden />
                {coverBusy ? 'Uploading…' : 'Change cover'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={coverBusy}
              onClick={() => coverInputRef.current?.click()}
              className="mb-8 flex w-full items-center gap-4 rounded-xl border border-dashed border-brand-black/20 bg-brand-stone/60 px-5 py-4 text-left transition hover:border-brand-gold hover:bg-brand-gold-pale/40 disabled:opacity-60"
            >
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-deep shadow-card">
                <HugeiconsIcon icon={ImageAdd01Icon} className="h-5 w-5" aria-hidden />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-brand-black">{coverBusy ? 'Uploading…' : 'Add a cover image'}</span>
                <span className="text-xs text-brand-grey">Optional. An old photo or a team shot works well.</span>
              </span>
            </button>
          )}
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={onCoverChange} />

          <input
            type="text"
            name="title"
            required
            placeholder="Title"
            className="story-title-input"
            aria-label="Title"
          />

          <div className="mt-5 flex items-start gap-3 border-b border-brand-black/10 pb-6">
            <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-stone text-brand-grey" aria-hidden>
              <HugeiconsIcon icon={UserIcon} className="h-5 w-5" />
            </span>
            <div className="grid min-w-0 flex-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              <label className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light">Written by</span>
                <input
                  type="text"
                  name="authorName"
                  required
                  placeholder="Your name"
                  className="story-byline-input text-base font-medium"
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-grey-light">
                  Email <span className="font-normal normal-case tracking-normal">(optional, not published)</span>
                </span>
                <input
                  type="email"
                  name="authorEmail"
                  placeholder="you@example.com"
                  className="story-byline-input text-sm"
                />
              </label>
            </div>
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
