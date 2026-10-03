'use client'

import { useState } from 'react'

/**
 * Share a page: the native share sheet when the browser has one, otherwise copy the link.
 * `path` is site-relative so the link always uses the host the visitor is on.
 */
export function ShareButton({
  path,
  title,
  label = 'Share',
  tone = 'dark',
}: {
  path: string
  title: string
  label?: string
  /** `dark` for the black hero banner, `light` on white page sections. */
  tone?: 'dark' | 'light'
}) {
  const [status, setStatus] = useState('')

  async function share() {
    const url = new URL(path, window.location.origin).toString()
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setStatus('Link copied')
    } catch (err) {
      // Closing the share sheet rejects with AbortError: not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return
      try {
        await navigator.clipboard.writeText(url)
        setStatus('Link copied')
      } catch {
        setStatus(`Copy this link: ${url}`)
      }
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={share}
        className={
          tone === 'dark'
            ? 'inline-flex min-h-11 items-center rounded-full bg-white/10 px-4 text-sm font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/15'
            : 'inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-brand-charcoal ring-1 ring-brand-black/10 transition hover:ring-brand-gold/60'
        }
      >
        {label}
      </button>
      <span role="status" aria-live="polite" className={tone === 'dark' ? 'text-sm text-white/75' : 'text-sm text-brand-grey'}>{status}</span>
    </span>
  )
}
