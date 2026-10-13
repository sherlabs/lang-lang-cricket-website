'use client'

import { useEffect } from 'react'

/**
 * Opens the print dialog (which also offers "Save as PDF"). Print is the report's share output, so every `<details>` is opened for the
 * print and put back afterwards; this also covers Ctrl/Cmd+P. Hidden on paper.
 */
export function ScoutPrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = []
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('.scout-print details:not([open])')]
      for (const d of opened) d.open = true
    }
    const after = () => {
      for (const d of opened) d.open = false
      opened = []
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return (
    <button type="button" onClick={() => window.print()} className="scout-hide inline-flex min-h-11 items-center rounded-lg border border-brand-black/20 bg-white px-4 text-sm font-semibold text-brand-black hover:border-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
      {label}
    </button>
  )
}
