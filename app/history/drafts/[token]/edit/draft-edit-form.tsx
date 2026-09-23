'use client'

import { useState } from 'react'
import type { JSONContent } from '@tiptap/core'
import { updateDraftByToken } from './actions'
import { StoryFields } from '@/components/stories/story-fields'
import { uploadPublicStoryImage } from '@/lib/blob-client'
import { Button } from '@/components/ui/button'

type Props = {
  editToken: string
  status: string
  initialTitle: string
  initialAuthorName: string
  initialAuthorEmail: string
  initialCoverUrl: string
  initialContent: JSONContent
}

const STATUS_NOTE: Record<string, string> = {
  pending: 'Still waiting on a committee member to review this.',
  published: 'This story is already live — changes here update it immediately.',
  rejected: "This story wasn't approved. You can revise it, but it stays as-is until the club adds it back for review.",
}

export function DraftEditForm({
  editToken,
  status,
  initialTitle,
  initialAuthorName,
  initialAuthorEmail,
  initialCoverUrl,
  initialContent,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    setSaved(false)
    const result = await updateDraftByToken(editToken, formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  return (
    <form action={onSubmit} className="mx-auto flex max-w-2xl flex-col">
      <p className="mb-8 rounded-xl bg-brand-gold-pale px-4 py-3 text-sm text-brand-gold-deep ring-1 ring-brand-gold/30">
        {STATUS_NOTE[status] ?? null}
      </p>

      <StoryFields
        initialTitle={initialTitle}
        initialAuthorName={initialAuthorName}
        initialAuthorEmail={initialAuthorEmail}
        initialCoverUrl={initialCoverUrl}
        initialContent={initialContent}
        uploadCover={uploadPublicStoryImage}
        uploadEditorImage={uploadPublicStoryImage}
      />

      {error && (
        <p role="alert" className="mt-6 text-sm text-red-700">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="mt-6 text-sm font-medium text-brand-gold-deep">
          Saved.
        </p>
      )}
      <div className="mt-8 border-t border-brand-black/10 pt-6">
        <Button type="submit" size="xl" variant="brand" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
