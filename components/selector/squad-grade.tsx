'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { ANSWER_DOT, ANSWER_LABEL } from '@/lib/availability'
import { formatLocalDate } from '@/lib/playhq/format'
import { ROLE_LABEL } from '@/lib/selection/roles'
import { RECENCY_LABEL, type Recency } from '@/lib/selection/squad-seed'
import type { Candidate, GradeBoard, SeedPreview, SquadCard } from '@/lib/selector-squad-queries'
import { addMembersAction, applySeedAction, moveMemberAction, previewSeedAction, removeMemberAction, searchCandidatesAction } from '@/app/(frontend)/selector/board-actions'
import { btnPrimary, btnQuiet, field } from './styles'
import { Sheet } from './ui'

type Props = { grade: GradeBoard; others: { squadId: number; gradeName: string }[] }

/**
 * One grade's squad. Each card has a "Move..." button that opens a bottom sheet (move to another grade, or remove): the only way
 * to move a player in this version, so it works the same on a phone and on a desktop. "Add players" and "Start from last season"
 * open sheets too. Every change is one small write, so two selectors never overwrite each other.
 */
export function SquadGradeView({ grade, others }: Props) {
  const router = useRouter()
  const [moving, setMoving] = useState<SquadCard | null>(null)
  const [adding, setAdding] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()

  const run = (job: () => Promise<{ ok: boolean; error?: string } | { added: number }>, done: string) => {
    setMessage('')
    startTransition(async () => {
      const res = await job()
      if ('ok' in res && !res.ok) setMessage(res.error ?? 'Something went wrong.')
      else setMessage(done)
      setMoving(null)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-grey">{grade.cards.length} in the squad</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAdding(true)} className={btnPrimary}>Add players</button>
          <button type="button" onClick={() => setSeeding(true)} className={btnQuiet}>Start from last season</button>
        </div>
      </div>
      {message && <p role="status" className="mt-3 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{message}</p>}

      {grade.cards.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">No one is in this squad yet. Use Add players, or Start from last season.</p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {grade.cards.map((c) => (
            <li key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-brand-black/10">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/selector/players/${c.slug}`} className="block truncate font-semibold text-brand-black underline-offset-4 hover:underline">{c.name}</Link>
                  <p className="mt-0.5 text-xs text-brand-grey">
                    {ROLE_LABEL[c.role ?? 'unknown']} · {c.games} {c.games === 1 ? 'game' : 'games'} this season · {RECENCY_LABEL[c.recency]}
                    {c.hidden ? ' · Hidden on the site' : ''}
                  </p>
                </div>
                <button type="button" onClick={() => setMoving(c)} className={`${btnQuiet} shrink-0`} aria-label={`Move or remove ${c.name}`}>Move...</button>
              </div>
              {c.alsoIn.length > 0 && <p className="mt-2 inline-block rounded-full bg-brand-stone px-2 py-0.5 text-xs font-semibold text-brand-black">also in {c.alsoIn.join(', ')}</p>}
              {c.next.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-black" aria-label={`Availability of ${c.name}`}>
                  {c.next.map((n) => {
                    const f = grade.fixtures.find((x) => x.id === n.fixtureId)
                    return (
                      <li key={n.fixtureId} className="inline-flex items-center gap-1.5">
                        <span className={`size-2.5 rounded-full ${ANSWER_DOT[n.answer]}`} aria-hidden />
                        {f ? formatLocalDate(f.localDate, { weekday: false }).replace(/ \d{4}$/, '') : 'Game'}: {ANSWER_LABEL[n.answer]}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <Sheet open={moving !== null} title={moving ? `Move ${moving.name}` : ''} onClose={() => setMoving(null)}>
        {moving && (
          <div className="space-y-3">
            {others.length > 0 && <p className="text-sm text-brand-grey">Tap a grade to move {moving.name} there. They leave {grade.gradeName}.</p>}
            <ul className="space-y-2">
              {others.map((o) => (
                <li key={o.squadId}>
                  <button type="button" disabled={pending} className={`${btnQuiet} w-full justify-start`} onClick={() => run(() => moveMemberAction({ fromSquadId: grade.squadId, toSquadId: o.squadId, playerId: moving.id }), `${moving.name} moved to ${o.gradeName}.`)}>
                    Move to {o.gradeName}
                  </button>
                </li>
              ))}
            </ul>
            {others.length > 0 && <p className="text-sm text-brand-grey">To have a player in two grades, add them to the other grade with Add players.</p>}
            <button type="button" disabled={pending} className={`${btnQuiet} w-full justify-start border-red-300 text-red-800`} onClick={() => run(() => removeMemberAction({ squadId: grade.squadId, playerId: moving.id }), `${moving.name} removed from ${grade.gradeName}.`)}>
              Remove from {grade.gradeName}
            </button>
          </div>
        )}
      </Sheet>

      <AddSheet open={adding} grade={grade} onClose={() => setAdding(false)} onAdded={(n) => { setMessage(`${n} ${n === 1 ? 'player' : 'players'} added.`); setAdding(false); router.refresh() }} />
      <SeedSheet open={seeding} onClose={() => setSeeding(false)} onDone={(n) => { setMessage(`${n} ${n === 1 ? 'player' : 'players'} added from last season.`); setSeeding(false); router.refresh() }} />
    </div>
  )
}

const FILTERS: { value: Recency | 'all'; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'this-season', label: RECENCY_LABEL['this-season'] },
  { value: 'last-season', label: RECENCY_LABEL['last-season'] },
  { value: 'recent', label: 'Played in the last few years' },
  { value: 'never', label: RECENCY_LABEL.never },
]

function AddSheet({ open, grade, onClose, onAdded }: { open: boolean; grade: GradeBoard; onClose: () => void; onAdded: (n: number) => void }) {
  const [q, setQ] = useState('')
  const [recency, setRecency] = useState<Recency | 'all'>('recent')
  const [found, setFound] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchError, setSearchError] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let live = true
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const rows = await searchCandidatesAction({ squadId: grade.squadId, q, recency })
        if (live) {
          setFound(rows)
          setSearchError('')
        }
      } catch {
        if (live) setSearchError('Could not search just now. Check your connection and try again.')
      } finally {
        if (live) setLoading(false)
      }
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [open, q, recency, grade.squadId])

  const toggle = useCallback((id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n }), [])
  const submit = () => startTransition(async () => {
    const res = await addMembersAction({ squadId: grade.squadId, playerIds: [...picked] })
    if (!res.ok) { setError(res.error); return }
    setPicked(new Set())
    onAdded(res.changed)
  })

  return (
    <Sheet open={open} title={`Add players to ${grade.gradeName}`} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm font-medium text-brand-black">
          Search by name
          <input className={`${field} mt-1`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </label>
        <label className="block text-sm font-medium text-brand-black">
          Show
          <select className={`${field} mt-1`} value={recency} onChange={(e) => setRecency(e.target.value as Recency | 'all')}>
            {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {searchError && <p role="alert" className="text-sm text-red-800">{searchError}</p>}
        {loading && found.length === 0 ? (
          <p role="status" className="text-sm text-brand-grey">Searching…</p>
        ) : found.length === 0 ? (
          <p className="text-sm text-brand-grey">No players match.{recency !== 'all' ? ' Try “Everyone” in the Show list to widen the search.' : ''}</p>
        ) : (
          <ul className="divide-y divide-brand-black/10 rounded-lg ring-1 ring-brand-black/10">
            {found.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                  <input type="checkbox" className="size-5" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-brand-black">{c.name}</span>
                    <span className="block text-xs text-brand-grey">{RECENCY_LABEL[c.recency]}{c.games ? ` · ${c.games} this season` : ''}{c.hidden ? ' · Hidden on the site' : ''}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className={`${btnPrimary} w-full`} disabled={picked.size === 0 || pending} onClick={submit}>
          {pending ? 'Adding...' : `Add ${picked.size} ${picked.size === 1 ? 'player' : 'players'}`}
        </button>
      </div>
    </Sheet>
  )
}

function SeedSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (n: number) => void }) {
  const [preview, setPreview] = useState<SeedPreview | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (!open) return
    let live = true
    previewSeedAction().then((p) => live && setPreview(p))
    return () => {
      live = false
      setPreview(null)
    }
  }, [open])
  const total = preview?.grades.reduce((n, g) => n + g.add.length, 0) ?? 0
  return (
    <Sheet open={open} title="Start from last season" onClose={onClose}>
      {!preview ? (
        <p className="text-sm text-brand-grey">Looking at last season...</p>
      ) : preview.fromYear == null ? (
        <p className="text-sm text-brand-grey">There are no earlier seasons with games to copy from.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-brand-grey">These players played in {preview.fromYear}. Nothing changes until you confirm, and no one is ever removed.</p>
          {preview.grades.map((g) => (
            <section key={g.squadId}>
              <h3 className="font-bold text-brand-black">{g.gradeName}: {g.add.length} to add{g.already ? `, ${g.already} already in` : ''}</h3>
              {g.add.length > 0 && <p className="mt-1 text-sm text-brand-grey">{g.add.map((p) => p.name).join(', ')}</p>}
            </section>
          ))}
          {preview.unmatched.length > 0 && <p className="text-xs text-brand-grey">No squad this season for: {preview.unmatched.join(', ')}.</p>}
          <button type="button" className={`${btnPrimary} w-full`} disabled={total === 0 || pending} onClick={() => startTransition(async () => onDone((await applySeedAction()).added))}>
            {pending ? 'Adding...' : `Add ${total} ${total === 1 ? 'player' : 'players'}`}
          </button>
        </div>
      )}
    </Sheet>
  )
}
