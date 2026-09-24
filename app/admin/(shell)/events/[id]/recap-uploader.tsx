'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addEventPhotos } from '../photo-actions'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'
import { Field, FileInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

const MAX_EDGE = 1600

export function RecapUploader({ eventId }: { eventId: number }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
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
        urls.push(await uploadToBlob(prepared, 'events'))
      }
      setStatus({ tone: 'busy', text: 'Saving…' })
      await addEventPhotos(eventId, urls)
      setStatus({ tone: 'ok', text: `Added ${urls.length} photo${urls.length === 1 ? '' : 's'}.` })
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
      <Field label="Recap photos" htmlFor="recap-files" hint={`Select one or many. Each is resized to ${MAX_EDGE}px before upload.`}>
        <FileInput id="recap-files" ref={inputRef} accept="image/*" multiple required disabled={busy} />
      </Field>
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
