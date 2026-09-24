'use client'

/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { AlertCircleIcon, Cancel01Icon, ImageAdd01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { optimiseImage, uploadToBlob, type UploadPrefix } from '@/lib/blob-client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Lifecycle of one file in the batch:
 *   queued → optimising → uploading → uploaded → (removed from the batch once saved)
 *                    ↘ failed (retry → queued)
 * `uploaded` means the Blob file exists but the URL hasn't been registered yet
 * (`onUploaded` still pending or failed). Retrying from there re-runs the save
 * only, so a failed save never re-uploads and orphans a second Blob file.
 */
type Status = 'queued' | 'optimising' | 'uploading' | 'uploaded' | 'failed'

type Item = {
  id: number
  file: File
  status: Status
  /** 0–100 while uploading. */
  progress: number
  url?: string
  error?: string
}

type Props = {
  /** Blob folder the files land in. */
  prefix: UploadPrefix
  /** Longest edge after client-side resize. */
  maxEdge?: number
  /** Simultaneous uploads. Enough to feel quick on a big batch without hammering the network. */
  concurrency?: number
  /** Called once per run with every URL that uploaded successfully. Throwing keeps those items retryable. */
  onUploaded: (urls: string[]) => Promise<void>
  /** Singular noun for copy, e.g. "photo". */
  noun?: string
}

const STATUS_LABEL: Record<Status, string> = {
  queued: 'Ready to upload',
  optimising: 'Optimising…',
  uploading: 'Uploading…',
  uploaded: 'Uploaded, saving…',
  failed: 'Failed',
}

let nextId = 1

function fileKey(f: File) {
  return `${f.name}:${f.size}:${f.lastModified}`
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Drag-and-drop bulk image uploader: preview the batch, drop files before
 * uploading, then upload with a small concurrency pool and per-file status.
 * Files that fail don't sink the batch — what succeeds is handed to
 * `onUploaded`, what didn't stays in the grid with a retry button.
 */
export function BulkImageUploader({ prefix, maxEdge = 1600, concurrency = 3, onUploaded, noun = 'photo' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  // The pool reads the live list through this ref so a worker never acts on a stale closure;
  // runningRef guards re-entry the same way (state alone could be stale inside a handler).
  const itemsRef = useRef(items)
  itemsRef.current = items
  const runningRef = useRef(false)

  const patch = useCallback((id: number, changes: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)))
  }, [])

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list)
    const images = incoming.filter((f) => f.type.startsWith('image/'))
    const existing = new Set(itemsRef.current.map((it) => fileKey(it.file)))
    const fresh = images.filter((f) => !existing.has(fileKey(f)))
    if (fresh.length > 0) {
      setItems((prev) => [...prev, ...fresh.map((file) => ({ id: nextId++, file, status: 'queued' as const, progress: 0 }))])
    }
    const skippedNonImage = incoming.length - images.length
    const skippedDupes = images.length - fresh.length
    const skipped: string[] = []
    if (skippedNonImage > 0) skipped.push(`${skippedNonImage} non-image file${skippedNonImage === 1 ? '' : 's'}`)
    if (skippedDupes > 0) skipped.push(`${skippedDupes} duplicate${skippedDupes === 1 ? '' : 's'}`)
    setNotice(skipped.length > 0 ? { tone: 'info', text: `Skipped ${skipped.join(' and ')}.` } : null)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) addFiles(e.target.files)
    // Clear so picking the same file again after removing it still fires `change`.
    e.target.value = ''
  }

  function remove(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  function retry(id: number) {
    patch(id, { status: 'queued', progress: 0, error: undefined })
    // Run just this file now; passing the id explicitly means we don't depend on the state above having landed.
    void run([id])
  }

  /** Upload one file end-to-end, recording each step on its item. Never throws; resolves to the URL or null on failure. */
  async function uploadOne(item: Item): Promise<string | null> {
    try {
      patch(item.id, { status: 'optimising', progress: 0 })
      const prepared = await optimiseImage(item.file, { maxEdge })
      patch(item.id, { status: 'uploading' })
      const url = await uploadToBlob(prepared, prefix, (p) => patch(item.id, { progress: p }))
      patch(item.id, { status: 'uploaded', progress: 100, url })
      return url
    } catch (err) {
      patch(item.id, { status: 'failed', error: (err as Error).message || 'Upload failed' })
      return null
    }
  }

  /** Upload every queued file (or just `onlyIds`), then hand the successful URLs to `onUploaded` in one call. */
  async function run(onlyIds?: number[]) {
    if (runningRef.current) return
    const queue = onlyIds ?? itemsRef.current.filter((it) => it.status === 'queued').map((it) => it.id)
    const alreadyUploaded = itemsRef.current.some((it) => it.status === 'uploaded')
    if (queue.length === 0 && !alreadyUploaded) return
    runningRef.current = true
    setRunning(true)
    setNotice(null)
    try {
      // Outcomes are collected straight from the workers rather than read back
      // from state: React batches the final `patch` of the last file, so
      // itemsRef can still be one render behind when Promise.all resolves.
      // Items left at `uploaded` by an earlier failed save are picked up too.
      const uploaded = new Map<number, string>()
      for (const it of itemsRef.current) if (it.status === 'uploaded' && it.url) uploaded.set(it.id, it.url)
      let failed = 0

      // Fixed-size worker pool: each worker pulls the next queued id until the queue is empty.
      let cursor = 0
      const worker = async () => {
        while (cursor < queue.length) {
          const id = queue[cursor++]
          const item = itemsRef.current.find((it) => it.id === id)
          // Skip if it was removed from the batch while waiting its turn.
          if (!item || !(onlyIds || item.status === 'queued')) continue
          const url = await uploadOne(item)
          if (url) uploaded.set(item.id, url)
          else failed++
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

      if (uploaded.size > 0) {
        try {
          await onUploaded(Array.from(uploaded.values()))
        } catch (err) {
          setNotice({
            tone: 'error',
            text: `${uploaded.size} ${noun}${uploaded.size === 1 ? '' : 's'} uploaded but couldn't be saved: ${(err as Error).message}. Use "Retry save".`,
          })
          return
        }
        setItems((prev) => prev.filter((it) => !uploaded.has(it.id)))
      }
      const parts: string[] = []
      if (uploaded.size > 0) parts.push(`Added ${uploaded.size} ${noun}${uploaded.size === 1 ? '' : 's'}.`)
      if (failed > 0) parts.push(`${failed} failed — retry or remove ${failed === 1 ? 'it' : 'them'} below.`)
      if (parts.length > 0) setNotice({ tone: failed > 0 ? 'error' : 'ok', text: parts.join(' ') })
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }

  // Drag-and-drop is a progressive enhancement over the picker button below.
  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (running) return
    e.dataTransfer.dropEffect = 'copy'
    if (!dragging) setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    // `dragleave` also fires when moving over a child — only clear when actually leaving the zone.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (running) return
    addFiles(e.dataTransfer.files)
  }

  const queued = items.filter((it) => it.status === 'queued').length
  const needsSave = items.some((it) => it.status === 'uploaded')
  const buttonLabel = running
    ? 'Uploading…'
    : needsSave && queued === 0
      ? 'Retry save'
      : `Upload ${queued} ${noun}${queued === 1 ? '' : 's'}`

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition',
          dragging ? 'border-brand-gold bg-brand-gold-pale' : 'border-brand-black/20 bg-brand-stone/60',
          running && 'opacity-60'
        )}
      >
        <HugeiconsIcon icon={ImageAdd01Icon} className={cn('h-8 w-8', dragging ? 'text-brand-gold-deep' : 'text-brand-grey')} aria-hidden />
        <p className="text-sm font-medium text-brand-black">{dragging ? `Drop to add ${noun}s` : `Drag and drop ${noun}s here`}</p>
        <p className="text-xs text-brand-grey">or</p>
        <Button type="button" variant="brand" size="xl" disabled={running} onClick={() => inputRef.current?.click()}>
          Choose {noun}s
        </Button>
        <p className="text-xs text-brand-grey">
          Select one or many. Each is resized to {maxEdge}px in your browser before upload.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={running}
          onChange={onInputChange}
        />
      </div>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" aria-label={`Selected ${noun}s`}>
          {items.map((it) => (
            <Thumb key={it.id} item={it} busy={running} onRemove={() => remove(it.id)} onRetry={() => retry(it.id)} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="button" size="xl" variant="brand" disabled={running || (queued === 0 && !needsSave)} onClick={() => void run()}>
          {buttonLabel}
        </Button>
        {items.length > 0 && !running && (
          <Button type="button" size="xl" variant="outline" onClick={() => setItems([])}>
            Clear
          </Button>
        )}
        {notice && (
          <p role="status" aria-live="polite" className={cn('text-sm', notice.tone === 'error' ? 'text-red-700' : 'text-brand-grey')}>
            {notice.text}
          </p>
        )}
      </div>
    </div>
  )
}

function Thumb({ item, busy, onRemove, onRetry }: { item: Item; busy: boolean; onRemove: () => void; onRetry: () => void }) {
  const { file, status } = item
  const inFlight = status === 'optimising' || status === 'uploading' || status === 'uploaded'
  // Queued files can still be pulled even mid-run — the pool skips anything that's gone by its turn.
  const canRemove = !inFlight

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-lg bg-brand-stone ring-1 ring-brand-black/5">
      <div className="relative">
        <PreviewImage file={file} className={cn('aspect-square w-full object-cover', (inFlight || status === 'failed') && 'opacity-60')} />
        {status === 'uploading' && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-brand-black/20" aria-hidden>
            <div className="h-full bg-brand-gold transition-[width]" style={{ width: `${item.progress}%` }} />
          </div>
        )}
        {(status === 'optimising' || status === 'uploaded') && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 animate-pulse bg-brand-gold/70" aria-hidden />
        )}
        {status === 'failed' && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-white p-0.5 text-red-700 shadow" aria-hidden>
            <HugeiconsIcon icon={AlertCircleIcon} className="h-5 w-5" />
          </span>
        )}
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${file.name}`}
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand-black/70 text-white transition hover:bg-brand-black focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 p-2 text-xs">
        <p className="truncate font-medium text-brand-black" title={file.name}>
          {file.name}
        </p>
        <p className={cn('flex items-center justify-between gap-2', status === 'failed' ? 'text-red-700' : 'text-brand-grey')}>
          <span className="truncate" title={status === 'failed' ? item.error : undefined}>
            {status === 'uploading' ? `Uploading ${Math.round(item.progress)}%` : status === 'failed' ? item.error || 'Failed' : STATUS_LABEL[status]}
          </span>
          {status === 'queued' && <span className="shrink-0">{formatBytes(file.size)}</span>}
          {status === 'failed' && !busy && (
            <button
              type="button"
              onClick={onRetry}
              aria-label={`Retry ${file.name}`}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-brand-black transition hover:bg-brand-gold-pale focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
            >
              <HugeiconsIcon icon={RefreshIcon} className="h-3.5 w-3.5" aria-hidden />
              Retry
            </button>
          )}
        </p>
      </div>
    </li>
  )
}

/**
 * Local preview of a not-yet-uploaded file. Same invariants as the cropper in
 * components/admin/image-cropper-dialog.tsx (whose git history documents the
 * runaway request loop from minting an object URL in the render body): exactly
 * one URL per file, never recreated on re-render, revoked on cleanup.
 *
 * The URL is created inside the effect rather than a useMemo because React
 * StrictMode (on by default in dev) mounts, runs cleanup, then remounts — a
 * memo'd URL would be revoked by that first cleanup and never recreated, and a
 * plain <img> (unlike react-easy-crop) usually hasn't fetched it by then.
 */
function PreviewImage({ file, className }: { file: File; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setObjectUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  if (!objectUrl) return <div className={cn(className, 'bg-brand-stone')} aria-label={file.name} role="img" />
  return <img src={objectUrl} alt={file.name} className={className} />
}
