'use client'

import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { optimiseImage, uploadPublicEventPhoto } from '@/lib/blob-client'
import { submitEventPhoto } from './actions'

const MAX_EDGE = 1600

const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-brand-black/10 bg-white px-4 text-base text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-brand-black">{label}</span>
      {hint && <span className="ml-1.5 text-xs font-normal text-brand-grey">{hint}</span>}
      {children}
    </label>
  )
}

/**
 * One-shot public photo submission for a past event. Uploads straight from
 * the browser to Blob (events/pending/), then registers the URL as a pending
 * photo via submitEventPhoto. No login, no edit link — there's nothing to
 * come back and edit.
 */
export function PhotoSubmitForm({ eventId }: { eventId: number }) {
  const [busy, setBusy] = useState<'upload' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)
    const file = data.get('photo')
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a photo first.')
      return
    }
    setError(null)
    try {
      setBusy('upload')
      const prepared = await optimiseImage(file, { maxEdge: MAX_EDGE })
      const url = await uploadPublicEventPhoto(prepared)

      setBusy('save')
      // Fresh FormData: the server action must never receive the File itself.
      const payload = new FormData()
      payload.set('eventId', String(eventId))
      payload.set('url', url)
      payload.set('submitterName', String(data.get('submitterName') ?? ''))
      payload.set('caption', String(data.get('caption') ?? ''))
      const result = await submitEventPhoto(payload)
      if (result?.error) {
        setError(result.error)
        return
      }
      form.reset()
      setDone(true)
    } catch (err) {
      setError(`Upload failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30">
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="display mt-5 text-2xl text-brand-black sm:text-3xl">Thanks for the photo</h3>
        <p className="mt-3 text-base leading-relaxed text-brand-grey">
          A committee member will take a look. Your photo will appear here once it&apos;s approved.
        </p>
        <Button type="button" variant="outline" size="xl" className="mt-6" onClick={() => setDone(false)}>
          Add another photo
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
      <h3 className="display text-2xl text-brand-black">Were you there?</h3>
      <p className="mt-1.5 text-sm text-brand-grey">
        Share a photo from the day. We&apos;ll check it over before it goes up.
      </p>

      <div className="mt-6 flex flex-col gap-5">
        <Field label="Photo">
          <input
            type="file"
            name="photo"
            accept="image/*"
            required
            disabled={busy != null}
            className="mt-2 block w-full rounded-xl border border-dashed border-brand-black/20 bg-brand-stone/60 px-4 py-3 text-sm text-brand-grey file:mr-3 file:min-h-8 file:rounded-lg file:border-0 file:bg-brand-black file:px-3 file:text-xs file:font-semibold file:text-white"
          />
        </Field>
        <Field label="Your name" hint="(optional)">
          <input type="text" name="submitterName" autoComplete="name" placeholder="So we know who to thank" disabled={busy != null} className={inputClass} />
        </Field>
        <Field label="Caption" hint="(optional)">
          <input type="text" name="caption" placeholder="What's happening in the photo?" disabled={busy != null} className={inputClass} />
        </Field>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 border-t border-brand-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-brand-grey-light">Photos are resized before upload to keep things quick.</p>
        <Button type="submit" size="xl" variant="brand" disabled={busy != null} className="w-full sm:w-auto sm:px-8">
          {busy === 'upload' ? 'Uploading…' : busy === 'save' ? 'Sending…' : 'Send photo'}
        </Button>
      </div>
    </form>
  )
}
