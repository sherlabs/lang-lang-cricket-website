'use client'

import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { submitStory } from './actions'
import { DRAFT_COOKIE } from '@/lib/story-tokens'
import { StoryFields } from '@/components/stories/story-fields'
import { uploadPublicStoryImage } from '@/lib/blob-client'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { DraftLinks } from '@/components/stories/draft-links'
import { submitKeepingInput } from '@/lib/form-submit'

function readDraftCookie(): { title: string; editToken: string; viewToken: string } | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${DRAFT_COOKIE}=([^;]*)`))
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

function SubmitStoryForm({ intro }: { intro: string }) {
  const params = useSearchParams()
  const submitted = params.get('submitted') === '1'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    const result = await submitStory(formData)
    if (result?.error) {
      setError(result.error)
      setBusy(false)
    }
    // no result / redirect: Next's redirect() already navigated away, nothing to do here
  }

  if (submitted) {
    const draft = readDraftCookie()
    return (
      <main>
        <PageHeader
          eyebrow="Your story"
          title="Thanks for sharing"
          intro="A committee member will review your story before it goes live on the history page."
        />
        {draft && (
          <section className="container-site py-12 lg:py-16">
            <div className="mx-auto max-w-xl">
              <DraftLinks editToken={draft.editToken} viewToken={draft.viewToken} />
            </div>
          </section>
        )}
      </main>
    )
  }

  return (
    <main>
      <PageHeader
        eyebrow="Your story"
        title="Share your story"
        intro={intro}
      />
      <section className="container-site py-12 lg:py-16">
        <form onSubmit={submitKeepingInput(onSubmit)} className="mx-auto flex max-w-2xl flex-col">
          <StoryFields uploadCover={uploadPublicStoryImage} uploadEditorImage={uploadPublicStoryImage} showHoneypot />

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

export function SubmitStoryPageClient({ intro }: { intro: string }) {
  return (
    <Suspense fallback={null}>
      <SubmitStoryForm intro={intro} />
    </Suspense>
  )
}
