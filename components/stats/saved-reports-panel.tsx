'use client'

import { useEffect, useState, type FormEvent } from 'react'

type Report = { id: number; title: string; description: string; href: string; dropped: string[] }

/**
 * Admin-only bookmark list for StatLab (W2 spec 5.3). Rendered for everyone, but it asks the server
 * who is looking and shows nothing unless an admin is signed in, so the page stays static (ISR) and a
 * signed-out visitor never sees a list. The share link of a report is its StatLab address.
 */
export function SavedReportsPanel({ query }: { query: string }) {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchReports = async (): Promise<Report[] | null> => {
    try {
      const res = await fetch('/statlab/saved', { credentials: 'same-origin' })
      return res.ok ? ((await res.json()) as { reports: Report[] }).reports : null
    } catch {
      return null
    }
  }
  useEffect(() => {
    let alive = true
    void fetchReports().then((r) => { if (alive) setReports(r) })
    return () => { alive = false }
  }, [])

  if (reports === null) return null

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/statlab/saved', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, query }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setMessage(body.error ?? 'That report could not be saved.')
      else {
        setTitle('')
        setMessage('Saved.')
        setReports(await fetchReports())
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="saved-reports-heading" className="space-y-4 rounded-2xl bg-white p-5 shadow-card ring-1 ring-brand-black/5 sm:p-6">
      <h2 id="saved-reports-heading" className="display text-xl text-brand-black">Saved reports <span className="text-sm font-normal text-brand-grey">(admins only)</span></h2>
      <form onSubmit={save} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="saved-title" className="eyebrow">Name this table</label>
          <input id="saved-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required className="mt-2 min-h-11 w-full rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black" />
        </div>
        <button type="submit" disabled={busy || !query} className="min-h-11 rounded-md bg-brand-black px-5 text-sm font-semibold text-white transition hover:bg-brand-charcoal disabled:opacity-50">Save this report</button>
      </form>
      {!query && <p className="text-sm text-brand-grey">Change a column, filter or sort to save a table.</p>}
      <p role="status" className="text-sm text-brand-charcoal">{message}</p>
      {reports.length > 0 ? (
        <ul className="divide-y divide-brand-black/5">
          {reports.map((r) => (
            <li key={r.id} className="py-2.5">
              <a href={r.href} className="font-semibold text-brand-black hover:text-brand-gold-deep hover:underline">{r.title}</a>
              {r.description && <span className="text-sm text-brand-grey"> · {r.description}</span>}
              {r.dropped.length > 0 && <p className="text-xs text-brand-grey">Some columns in this report no longer exist and are left out ({r.dropped.join(', ')}).</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-brand-grey">No saved reports yet.</p>
      )}
    </section>
  )
}
