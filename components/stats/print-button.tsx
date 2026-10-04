'use client'

import { useEffect } from 'react'

/**
 * Opens the browser print dialog (which also offers "Save as PDF"). Closed disclosures would
 * print closed, so every `<details>` in the yearbook is opened for the print and put back after;
 * this also covers Ctrl/Cmd+P, not just the button. Hidden on paper.
 */
export function PrintButton({ label }: { label: string }) {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = []
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>('.yearbook-print details:not([open])')]
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
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hide mt-8 inline-flex min-h-11 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-gold hover:text-brand-gold"
    >
      {label}
    </button>
  )
}
