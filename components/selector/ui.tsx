'use client'

import { useEffect, useRef, useState } from 'react'

import { btnQuiet, field } from './styles'

/** A bottom sheet on a phone, a centred panel on a wide screen. Esc and the backdrop close it; focus moves into it. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // Callers pass a new inline `onClose` on every render; keeping it in a ref stops the effect below re-running (which would
  // move focus back to the dialog after every keystroke typed inside it).
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeRef.current()
      if (e.key !== 'Tab' || !ref.current) return
      const items = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null)
      if (!items.length) return e.preventDefault()
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="presentation">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-brand-black/50" onClick={onClose} tabIndex={-1} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-xl outline-none sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-brand-black/10 px-4 py-3">
          <h2 className="text-lg font-bold text-brand-black">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-semibold text-brand-black underline underline-offset-4">Close</button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

/** Copies `text`, or shows it selected when the clipboard is not available (some in-app browsers). */
export function CopyButton({ text, label = 'Copy', className = btnQuiet }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      setTimeout(() => setState('idle'), 2500)
    } catch {
      setState('manual')
    }
  }
  return (
    <span className="inline-flex flex-col gap-2">
      <button type="button" onClick={copy} className={className}>{state === 'copied' ? 'Copied' : label}</button>
      <span role="status" className="sr-only">{state === 'copied' ? 'Copied to the clipboard' : ''}</span>
      {state === 'manual' && <input readOnly value={text} aria-label="Select and copy" onFocus={(e) => e.currentTarget.select()} className={field} />}
    </span>
  )
}
