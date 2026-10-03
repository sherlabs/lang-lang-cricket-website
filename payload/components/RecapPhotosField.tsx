'use client'

/* eslint-disable @next/next/no-img-element */
import { Button, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { optimiseImage } from '../../lib/blob-client'

/**
 * Lifecycle of one file in the batch:
 *   queued → optimising → uploading → (removed from the batch once created)
 *                    ↘ failed (retry → queued)
 * Each upload is one multipart `POST /api/event-photos` that creates the doc (the storage
 * plugin stores the file; WP1 finding 7.6(c)), so there is no separate "save" step.
 */
type Status = 'queued' | 'optimising' | 'uploading' | 'failed'

type Item = { id: number; file: File; status: Status; progress: number; error?: string }

/** Function bodies on Vercel cap at 4.5 MB; an optimised photo is far smaller. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_EDGE = 1600
const CONCURRENCY = 3

let nextId = 1
const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Multipart create with upload progress (fetch has none). Resolves on 2xx, rejects with the API message. */
function postPhoto(url: string, file: File, data: Record<string, unknown>, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    form.append('_payload', JSON.stringify(data))
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.withCredentials = true
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = `Upload failed (${xhr.status})`
      try {
        const json = JSON.parse(xhr.responseText) as { errors?: { message?: string }[] }
        message = json.errors?.[0]?.message || message
      } catch {
        // keep the status message
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(form)
  })
}

function PreviewImage({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement>(null)
  // One object URL per file, created in the effect (StrictMode-safe: cleanup revokes it and the
  // remount creates a fresh one) and assigned to the element directly — no render loop.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (ref.current) ref.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  return <img ref={ref} alt={file.name} />
}

/**
 * `events.fields.recapUpload` (ui, spec §9): bulk upload of recap photos for a past one-time
 * event, ported from the old admin's BulkImageUploader. Drag-drop or pick many; dedupe by
 * name + size + mtime; each file is optimised in the browser (longest edge 1600px) and posted
 * with `{ event, status: 'approved' }`; concurrency 3; failures stay in the grid with Retry.
 * The `admin.condition` on the field shows it only for a past one-time event.
 */
export function RecapPhotosField() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const router = useRouter()
  const endpoint = `${config.serverURL ?? ''}${config.routes.api}/event-photos`
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  // The worker pool reads the live list through this ref (never a stale closure); every write
  // goes through `commit`, which updates the ref and the state together, outside render.
  const itemsRef = useRef<Item[]>([])
  const runningRef = useRef(false)

  const commit = useCallback((fn: (prev: Item[]) => Item[]) => {
    itemsRef.current = fn(itemsRef.current)
    setItems(itemsRef.current)
  }, [])
  const patch = useCallback(
    (itemId: number, changes: Partial<Item>) => commit((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...changes } : it))),
    [commit],
  )

  if (!id) return null

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    const images = incoming.filter((f) => f.type.startsWith('image/'))
    const existing = new Set(itemsRef.current.map((it) => fileKey(it.file)))
    const fresh = images.filter((f) => !existing.has(fileKey(f)))
    if (fresh.length) commit((prev) => [...prev, ...fresh.map((file) => ({ id: nextId++, file, status: 'queued' as const, progress: 0 }))])
    const skipped: string[] = []
    const nonImage = incoming.length - images.length
    const dupes = images.length - fresh.length
    if (nonImage) skipped.push(`${nonImage} non-image file${nonImage === 1 ? '' : 's'}`)
    if (dupes) skipped.push(`${dupes} duplicate${dupes === 1 ? '' : 's'}`)
    setNotice(skipped.length ? { tone: 'info', text: `Skipped ${skipped.join(' and ')}.` } : null)
  }

  async function uploadOne(item: Item): Promise<boolean> {
    try {
      patch(item.id, { status: 'optimising', progress: 0 })
      const prepared = await optimiseImage(item.file, { maxEdge: MAX_EDGE })
      if (prepared.size > MAX_UPLOAD_BYTES) {
        throw new Error(`Still ${formatBytes(prepared.size)} after optimising (max 4 MB). Try a smaller photo.`)
      }
      patch(item.id, { status: 'uploading' })
      await postPhoto(endpoint, prepared, { event: id, status: 'approved' }, (p) => patch(item.id, { progress: p }))
      return true
    } catch (err) {
      patch(item.id, { status: 'failed', error: (err as Error).message || 'Upload failed' })
      return false
    }
  }

  async function run(onlyIds?: number[]) {
    if (runningRef.current) return
    const queue = onlyIds ?? itemsRef.current.filter((it) => it.status === 'queued').map((it) => it.id)
    if (!queue.length) return
    runningRef.current = true
    setRunning(true)
    setNotice(null)
    const done = new Set<number>()
    let failed = 0
    try {
      let cursor = 0
      const worker = async () => {
        while (cursor < queue.length) {
          const itemId = queue[cursor++]
          const item = itemsRef.current.find((it) => it.id === itemId)
          if (!item || !(onlyIds || item.status === 'queued')) continue
          if (await uploadOne(item)) done.add(item.id)
          else failed++
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
      if (done.size) commit((prev) => prev.filter((it) => !done.has(it.id)))
      const parts: string[] = []
      if (done.size) parts.push(`Added ${done.size} photo${done.size === 1 ? '' : 's'}.`)
      if (failed) parts.push(`${failed} failed — retry or remove ${failed === 1 ? 'it' : 'them'} below.`)
      if (parts.length) setNotice({ tone: failed ? 'error' : 'ok', text: parts.join(' ') })
      // Refresh the server-rendered `photos` join below.
      if (done.size) router.refresh()
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  function retry(itemId: number) {
    patch(itemId, { status: 'queued', progress: 0, error: undefined })
    void run([itemId])
  }

  const queued = items.filter((it) => it.status === 'queued').length

  return (
    <div className="club-field">
      <h3 className="club-field__title">Recap photos</h3>
      <div
        className={`club-dropzone${dragging ? ' club-dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          if (!running) setDragging(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!running) addFiles(e.dataTransfer.files)
        }}
      >
        <p>{dragging ? 'Drop to add photos' : 'Drag and drop photos here, or'}</p>
        <Button buttonStyle="secondary" disabled={running} onClick={() => inputRef.current?.click()} type="button">
          Choose photos
        </Button>
        <p className="club-muted">Select one or many. Each is resized to {MAX_EDGE}px in your browser before upload, and published straight away.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          disabled={running}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="club-photo-grid">
          {items.map((it) => (
            <li key={it.id} className={`club-photo-card${it.status === 'failed' ? ' club-photo-card--failed' : ''}`}>
              <PreviewImage file={it.file} />
              {it.status === 'uploading' && (
                <div className="club-progress" aria-hidden>
                  <span style={{ width: `${it.progress}%` }} />
                </div>
              )}
              <div className="club-photo-card__body">
                <p className="club-table__strong" title={it.file.name}>
                  {it.file.name}
                </p>
                <p className={it.status === 'failed' ? 'club-error' : 'club-muted'}>
                  {it.status === 'queued' && `Ready · ${formatBytes(it.file.size)}`}
                  {it.status === 'optimising' && 'Optimising…'}
                  {it.status === 'uploading' && `Uploading ${Math.round(it.progress)}%`}
                  {it.status === 'failed' && (it.error || 'Failed')}
                </p>
                {(it.status === 'queued' || it.status === 'failed') && !running && (
                  <div className="club-photo-card__actions">
                    {it.status === 'failed' && (
                      <Button buttonStyle="secondary" size="small" onClick={() => retry(it.id)} type="button">
                        Retry
                      </Button>
                    )}
                    <Button buttonStyle="secondary" size="small" onClick={() => commit((prev) => prev.filter((x) => x.id !== it.id))} type="button">
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="club-row">
        <Button buttonStyle="primary" disabled={running || queued === 0} onClick={() => void run()} type="button">
          {running ? 'Uploading…' : `Upload ${queued} photo${queued === 1 ? '' : 's'}`}
        </Button>
        {notice && (
          <p role="status" aria-live="polite" className={notice.tone === 'error' ? 'club-error' : 'club-muted'}>
            {notice.text}
          </p>
        )}
      </div>
    </div>
  )
}
