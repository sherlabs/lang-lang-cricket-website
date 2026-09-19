'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addGalleryPhotos } from '@/app/admin/(shell)/gallery/actions'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'
import { Field, FileInput, TextInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

const MAX_EDGE = 1600

export function GalleryUploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'busy'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const files = Array.from(inputRef.current?.files ?? [])
    if (files.length === 0) return
    setBusy(true)
    try {
      const urls: string[] = []
      for (let i = 0; i < files.length; i++) {
        setStatus({ tone: 'busy', text: `Uploading ${i + 1} of ${files.length}…` })
        const prepared = await optimiseImage(files[i], { maxEdge: MAX_EDGE })
        urls.push(await uploadToBlob(prepared, 'gallery'))
      }
      setStatus({ tone: 'busy', text: 'Saving…' })
      await addGalleryPhotos(urls, caption)
      setStatus({ tone: 'ok', text: `Added ${urls.length} photo${urls.length === 1 ? '' : 's'}.` })
      setCaption('')
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (err) {
      setStatus({ tone: 'error', text: `Upload failed: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Photos"
          htmlFor="gallery-files"
          hint={`Select one or many. Each is resized to ${MAX_EDGE}px in your browser before upload and goes to the front of the gallery.`}
        >
          <FileInput id="gallery-files" ref={inputRef} accept="image/*" multiple required disabled={busy} />
        </Field>
        <Field label="Caption" htmlFor="gallery-caption" hint="Optional. Applied to every photo in this batch.">
          <TextInput
            id="gallery-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="e.g. Round 6 v Koo Wee Rup"
            disabled={busy}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="xl" variant="brand" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload photos'}
        </Button>
        {status && (
          <p role="status" className={status.tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-brand-grey'}>
            {status.text}
          </p>
        )}
      </div>
    </form>
  )
}
