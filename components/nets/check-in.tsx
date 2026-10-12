'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Attendee, FoundPlayer, RosterPlayer } from '@/lib/nets-queries'
import { btnPrimary, btnQuiet, field } from '@/components/selector/styles'

/**
 * Check-in for one net session (wave B spec 4.5): a big toggle row per squad player, search for anyone else on the club list, and
 * add a guest. "Here" means the person turned up; it is not a rating. Each tap saves at once; two taps on one person are one row.
 */
type Done = { ok: true } | { ok: false; error: string }
export type CheckInActions = {
  checkIn: (input: { sessionId: number; playerId: number }) => Promise<Done>
  checkOut: (input: { sessionId: number; key: string }) => Promise<Done>
  addGuest: (input: { sessionId: number; name: string }) => Promise<Done>
  search: (input: { q: string }) => Promise<FoundPlayer[]>
}

export function CheckIn({ sessionId, squad, others, guestsLeft, actions }: { sessionId: number; squad: RosterPlayer[]; others: Attendee[]; guestsLeft: number; actions: CheckInActions }) {
  const router = useRouter()
  const fromServer = (list: RosterPlayer[]) => new Set(list.filter((p) => p.present).map((p) => p.id))
  const [present, setPresent] = useState(() => fromServer(squad))
  // New data from the server (after router.refresh) replaces local state; adjusted during render, not in an effect.
  const [seen, setSeen] = useState(squad)
  if (seen !== squad) {
    setSeen(squad)
    setPresent(fromServer(squad))
  }
  const [error, setError] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [found, setFound] = useState<FoundPlayer[] | null>(null)
  const [guest, setGuest] = useState('')

  const total = present.size + others.length
  const apply = async (key: string, fn: () => Promise<Done>, optimistic?: () => void, revert?: () => void) => {
    setError('')
    setPending(key)
    optimistic?.()
    let ok = false
    try {
      const res = await fn()
      ok = res.ok
      if (!res.ok) {
        revert?.()
        setError(res.error)
      }
    } catch {
      revert?.()
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(null)
      router.refresh()
    }
    return ok
  }
  const toggle = (p: RosterPlayer) => {
    const on = present.has(p.id)
    const set = (v: boolean) => setPresent((cur) => { const n = new Set(cur); if (v) n.add(p.id); else n.delete(p.id); return n })
    return apply(`p${p.id}`, () => (on ? actions.checkOut({ sessionId, key: `player:${p.id}` }) : actions.checkIn({ sessionId, playerId: p.id })), () => set(!on), () => set(on))
  }

  return (
    <div>
      <p role="status" aria-live="polite" className="text-lg font-bold text-brand-black">{total} turned up</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {squad.map((p) => {
          const on = present.has(p.id)
          return (
            <li key={p.id}>
              <button type="button" aria-pressed={on} disabled={pending === `p${p.id}`} onClick={() => toggle(p)} className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-4 text-left text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-black ${on ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
                <span>{p.name}</span>
                <span className="text-sm">{on ? 'Here' : 'Not here'}</span>
              </button>
            </li>
          )
        })}
        {squad.length === 0 && <li className="text-sm text-brand-grey sm:col-span-2">No squads for this season yet. Search for players below, or add them in Squads.</li>}
      </ul>

      {others.length > 0 && (
        <>
          <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-brand-grey">Also here</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {others.map((a) => (
              <li key={a.key}>
                <button type="button" disabled={pending === a.key} onClick={() => apply(a.key, () => actions.checkOut({ sessionId, key: a.key }))} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg bg-brand-black px-4 text-left text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-black">
                  <span>{a.name}{a.isGuest ? ' (guest)' : ''}</span>
                  <span className="text-sm">Remove</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <form
        className="mt-5"
        onSubmit={async (e) => {
          e.preventDefault()
          setFound(await actions.search({ q }).catch(() => []))
        }}
      >
        <label className="block text-sm font-medium text-brand-black">
          Search for anyone else on the club list
          <input className={`${field} mt-1`} value={q} onChange={(e) => setQ(e.target.value)} type="search" autoComplete="off" placeholder="Name" />
        </label>
        <button type="submit" className={`${btnQuiet} mt-2`} disabled={q.trim().length < 2}>Search</button>
      </form>
      {found && (
        <ul className="mt-2 space-y-2" aria-label="Search results">
          {found.length === 0 && <li className="text-sm text-brand-grey">No one found.</li>}
          {found.map((p) => {
            const already = present.has(p.id) || others.some((o) => o.playerId === p.id)
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-white p-2 pl-4 ring-1 ring-brand-black/10">
                <span className="font-semibold text-brand-black">{p.name}</span>
                {already ? <span className="px-3 text-sm text-brand-grey">Already here</span> : <button type="button" className={btnPrimary} onClick={() => apply(`s${p.id}`, () => actions.checkIn({ sessionId, playerId: p.id }), () => setFound((f) => (f ? f.filter((x) => x.id !== p.id) : f)))}>Check in</button>}
              </li>
            )
          })}
        </ul>
      )}

      <form
        className="mt-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!guest.trim()) return
          // Keep the typed name when the add failed, so it need not be typed again.
          if (await apply('guest', () => actions.addGuest({ sessionId, name: guest }), undefined, undefined)) setGuest('')
        }}
      >
        <label className="block text-sm font-medium text-brand-black">
          Add a guest ({guestsLeft} left)
          <input className={`${field} mt-1`} value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={40} autoComplete="off" placeholder="Guest’s name" disabled={guestsLeft === 0} />
        </label>
        <button type="submit" className={`${btnQuiet} mt-2`} disabled={guestsLeft === 0 || !guest.trim()}>Add guest</button>
      </form>
      {error && <p role="alert" className="mt-3 rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{error}</p>}
    </div>
  )
}
