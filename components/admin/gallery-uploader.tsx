'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addGalleryPhotos } from '@/app/admin/gallery/actions'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'

const MAX_EDGE = 1600

export function GalleryUploader() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const files = Array.from(inputRef.current?.files ?? [])
    if (files.length === 0) return
    setBusy(true)
    try {
      const urls: string[] = []
      for (let i = 0; i < files.length; i++) {
        setStatus(`Uploading ${i + 1} of ${files.length}…`)
        const prepared = await optimiseImage(files[i], { maxEdge: MAX_EDGE })
        urls.push(await uploadToBlob(prepared, 'gallery'))
      }
      setStatus('Saving…')
      await addGalleryPhotos(urls, caption)
      setStatus(`Added ${urls.length} photo${urls.length === 1 ? '' : 's'}.`)
      setCaption('')
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } catch (err) {
      setStatus(`Upload failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mb-6 flex flex-wrap items-center gap-2 rounded border p-3">
      <input ref={inputRef} type="file" accept="image/*" multiple required disabled={busy} />
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption (optional, applied to all)"
        className="rounded border px-2 py-1"
        disabled={busy}
      />
      <button type="submit" disabled={busy} className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50">
        {busy ? 'Uploading…' : 'Upload'}
      </button>
      <span className="w-full text-xs text-neutral-500">
        Select one or many photos. They are resized to {MAX_EDGE}px in your browser before upload and go to the front of the
        gallery.
      </span>
      {status && <span className="w-full text-sm">{status}</span>}
    </form>
  )
}
