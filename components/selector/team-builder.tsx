'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ANSWER_DOT, ANSWER_LABEL, type Answer } from '@/lib/availability'
import { ROLE_LABEL } from '@/lib/selection/roles'
import { SIZE_LABEL, validateGuestName, XI_SIZES, type XiSize } from '@/lib/selection/team-sheet'
import { teamWarnings, type Warning } from '@/lib/selection/warnings'
import { deriveTeamStatus, PUBLISH_CHIP_LABEL, TEAM_STATUS_LABEL, type PublishChip } from '@/lib/team-status'
import type { Builder, SlotView } from '@/lib/selector-team-queries'
import { publishTeamsAction, saveTeamAction } from '@/app/(frontend)/selector/team-actions'
import { btn, btnPrimary, btnQuiet, field } from './styles'
import { Sheet } from './ui'

/**
 * The team builder (announce-teams spec 5.3), one column at 360 px. The batting order is a numbered list with Up, Down and Remove
 * on every row (no drag and drop) and a number box to jump to a position; C and WK are toggles; Add players is a bottom sheet of
 * the grade's squad grouped by reply. Warnings are recomputed from the same pure function the server runs at publish time.
 */
type Row = Omit<SlotView, 'order'>
const toRow = (s: SlotView): Row => {
  const { order, ...rest } = s
  void order
  return rest
}

const GROUPS: { answer: Answer; title: string }[] = [
  { answer: 'in', title: 'Available' },
  { answer: 'maybe', title: 'Maybe' },
  { answer: 'none', title: 'No reply' },
  { answer: 'out', title: 'Out' },
]

const chipTone: Record<string, string> = {
  'not-started': 'bg-brand-black/10 text-brand-black',
  'in-progress': 'bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30',
  ready: 'bg-status-ok-soft text-status-ok-ink',
  'needs-attention': 'bg-status-bad-soft text-status-bad-ink',
}

const iconBtn = 'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border border-brand-black/20 bg-white px-2 text-sm font-semibold text-brand-black hover:bg-brand-black/5 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black'
const toggleBtn = (on: boolean) => `${iconBtn} ${on ? '!border-brand-black !bg-brand-black !text-brand-gold' : ''}`

export function TeamBuilder({ builder, gameId, announceDefault }: { builder: Builder; gameId: string; announceDefault: boolean }) {
  const router = useRouter()
  const { view } = builder
  const fixture = view.fixture
  const [rows, setRows] = useState<Row[]>(() => view.slots.map(toRow))
  const [size, setSize] = useState<XiSize>(view.size)
  const [ready, setReady] = useState(view.markedReady)
  const [revision, setRevision] = useState(view.revision)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string; stale?: boolean; toShare?: boolean } | null>(null)
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmOut, setConfirmOut] = useState<Builder['candidates'][number] | null>(null)
  const scrollToShare = useRef(false)
  const [guest, setGuest] = useState('')
  const [guestError, setGuestError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [announce, setAnnounce] = useState(announceDefault)
  const [serverWarnings, setServerWarnings] = useState<{ gradeName: string; text: string }[] | null>(null)

  const warnings: Warning[] = useMemo(
    () => teamWarnings({ slots: rows.map((r) => ({ name: r.name, kind: r.playerId == null ? 'guest' : 'player', role: r.role, isCaptain: r.isCaptain, isKeeper: r.isKeeper, hidden: r.hidden, missing: r.missing, badGuest: r.playerId == null && !validateGuestName(r.guestName).ok, answer: r.answer, alsoPickedIn: r.alsoPickedIn })), size, fixtureStatus: fixture.status, fixtureMovedSinceSave: view.warnings.some((w) => w.code === 'fixture-moved') }),
    [rows, size, fixture.status, view.warnings],
  )
  const status = deriveTeamStatus({ slotCount: rows.length, size, markedReady: ready, warnings, slots: rows.map((r) => ({ role: r.role, isCaptain: r.isCaptain, isKeeper: r.isKeeper })) })
  const chip: PublishChip = view.chip
  const blocking = warnings.filter((w) => w.blocking)

  const change = (next: Row[]) => {
    setRows(next)
    setDirty(true)
    setMessage(null)
  }
  const move = (i: number, to: number) => {
    const target = Math.max(0, Math.min(rows.length - 1, to))
    if (target === i) return
    const next = [...rows]
    const [r] = next.splice(i, 1)
    next.splice(target, 0, r)
    change(next)
  }
  const remove = (i: number) => change(rows.filter((_, n) => n !== i))
  const toggleCaptain = (i: number) => change(rows.map((r, n) => ({ ...r, isCaptain: n === i ? !r.isCaptain : false })))
  const toggleKeeper = (i: number) => change(rows.map((r, n) => ({ ...r, isKeeper: n === i ? !r.isKeeper : false })))
  const addCandidate = (c: Builder['candidates'][number]) => {
    if (c.answer === 'out' && confirmOut?.id !== c.id) return setConfirmOut(c)
    setConfirmOut(null)
    change([...rows, { key: `p:${c.id}`, playerId: c.id, guestName: null, name: c.name, slug: c.slug, isCaptain: false, isKeeper: false, hidden: c.hidden, missing: false, role: c.role, batting: c.batting, bowling: c.bowling, answer: c.answer, alsoPickedIn: null }])
  }
  const addGuest = () => {
    const res = validateGuestName(guest)
    if (!res.ok) return setGuestError(res.error)
    if (rows.some((r) => r.playerId == null && r.guestName?.toLowerCase() === res.name.toLowerCase())) return setGuestError('That guest is already in the team.')
    setGuestError('')
    setGuest('')
    change([...rows, { key: `g:${res.name}`, playerId: null, guestName: res.name, slug: null, name: res.name, isCaptain: false, isKeeper: false, hidden: false, missing: false, role: 'unknown', batting: '', bowling: '', answer: 'none', alsoPickedIn: null }])
  }

  /** Saves the team as it stands. Returns the new revision, or null when the save failed (the message says why). */
  async function save(over: { markedReady?: boolean } = {}): Promise<number | null> {
    const res = await saveTeamAction({ gameId, expectedRevision: revision, size, markedReady: over.markedReady ?? ready, slots: rows.map((r) => ({ playerId: r.playerId, guestName: r.guestName, isCaptain: r.isCaptain, isKeeper: r.isKeeper })) })
    if (!res.ok) {
      setMessage({ tone: 'error', text: res.error, stale: res.stale })
      return null
    }
    setRevision(res.revision)
    setDirty(false)
    if (over.markedReady != null) setReady(over.markedReady)
    setMessage({ tone: 'ok', text: 'Saved.' })
    router.refresh()
    return res.revision
  }

  const onSave = () => startTransition(async () => void (await save()))
  const onReady = () => startTransition(async () => void (await save({ markedReady: !ready })))
  const onPublishClick = () => {
    setAcknowledged(false)
    setServerWarnings(null)
    setConfirming(true)
  }
  const onPublish = () =>
    startTransition(async () => {
      const rev = dirty ? await save() : revision
      if (rev == null) return setConfirming(false)
      const res = await publishTeamsAction({ gameIds: [gameId], announce, acknowledged, expectedRevisions: { [gameId]: rev } })
      if (!res.ok) {
        if (res.needsAcknowledgement) {
          setServerWarnings(res.needsAcknowledgement)
          return
        }
        setConfirming(false)
        return setMessage({ tone: 'error', text: res.error })
      }
      setConfirming(false)
      setMessage({ tone: 'ok', text: 'Teams published.', toShare: true })
      scrollToShare.current = true
      router.refresh()
    })

  const nonBlocking = warnings.filter((w) => !w.blocking)
  const goToShare = () => {
    const el = document.getElementById('share')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.focus({ preventScroll: true })
  }
  // The share section appears after the refresh that follows a publish: bring it into view once it is there.
  useEffect(() => {
    if (scrollToShare.current && view.publishCount > 0) {
      scrollToShare.current = false
      goToShare()
    }
  }, [view.publishCount])
  const publishBlockedBy = rows.length === 0 ? 'Pick at least one player before publishing.' : blocking[0]?.text ?? ''
  const notReadyBecause = ready && status !== 'ready' ? (status === 'needs-attention' ? 'Marked ready, but this team needs attention first (see the warnings above).' : 'Marked ready, but it also needs a full team, a captain (C) and a wicketkeeper (WK) to count as Ready.') : ''

  return (
    <div className="pb-28 sm:pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold ${chipTone[status]}`}>{TEAM_STATUS_LABEL[status]}</span>
        {chip && <span className="inline-flex min-h-8 items-center rounded-full bg-brand-black px-3 text-sm font-semibold text-brand-gold">{PUBLISH_CHIP_LABEL[chip]}</span>}
        {dirty && <span className="text-sm font-semibold text-brand-gold-deep">Unsaved changes</span>}
      </div>

      <label className="mt-4 block text-sm font-semibold text-brand-black" htmlFor="team-size">Players in the team</label>
      <select id="team-size" value={size} onChange={(e) => { setSize(Number(e.target.value) as XiSize); setDirty(true) }} className={`${field} mt-1 max-w-xs`}>
        {XI_SIZES.map((n) => <option key={n} value={n}>{SIZE_LABEL[n]}</option>)}
      </select>

      {warnings.length > 0 && (
        <ul aria-label="Warnings" className="mt-4 space-y-2">
          {warnings.map((w, i) => (
            <li key={i} className={`rounded-lg px-3 py-2 text-sm ring-1 ${w.blocking || w.strong ? 'bg-status-bad-soft text-status-bad-ink ring-status-bad/25' : 'bg-brand-gold-pale text-brand-black ring-brand-gold/30'}`}>
              <span className="font-semibold">{w.blocking ? 'Fix before publishing: ' : w.strong ? 'Check: ' : ''}</span>{w.text}
            </li>
          ))}
        </ul>
      )}
      {view.changes.length > 0 && (
        <div className="mt-4 rounded-lg bg-white p-3 ring-1 ring-brand-black/10">
          <p className="text-sm font-bold text-brand-black">Not published yet</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-brand-charcoal">{view.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}

      <h2 className="mt-6 text-lg font-bold text-brand-black">Batting order</h2>
      {rows.length === 0 ? (
        <p className="mt-2 rounded-xl bg-white p-4 text-brand-grey ring-1 ring-brand-black/10">Nobody picked yet. Press Add players.</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-xl bg-white p-3 ring-1 ring-brand-black/10">
              <div className="flex items-start gap-3">
                <label className="sr-only" htmlFor={`pos-${r.key}`}>Batting position for {r.name}</label>
                <input id={`pos-${r.key}`} inputMode="numeric" pattern="[0-9]*" key={`${r.key}-${i}`} defaultValue={i + 1} onBlur={(e) => { const n = Number(e.currentTarget.value); if (Number.isInteger(n) && n >= 1) move(i, n - 1); else e.currentTarget.value = String(i + 1) }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} className="h-11 w-12 shrink-0 rounded-lg border border-brand-black/20 text-center text-lg font-bold tabular-nums text-brand-black" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold text-brand-black">
                    {r.slug ? <Link href={`/selector/players/${r.slug}`} className="underline-offset-4 hover:underline">{r.name}</Link> : r.name}
                    {r.playerId == null && <span className="ml-2 text-xs font-semibold text-brand-grey">Guest</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-brand-grey">
                    {r.playerId != null && <span className="rounded-full bg-brand-black/5 px-2 py-0.5 text-xs font-semibold text-brand-black">{ROLE_LABEL[r.role]}</span>}
                    {r.playerId != null && (
                      <span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${ANSWER_DOT[r.answer]}`} />{ANSWER_LABEL[r.answer]}</span>
                    )}
                    {r.hidden && <span className="font-semibold text-status-bad-ink">Hidden on the site</span>}
                    {r.missing && <span className="font-semibold text-status-bad-ink">Removed player</span>}
                  </p>
                  {r.playerId != null && (r.batting || r.bowling) && (
                    <p className="mt-1 text-xs text-brand-grey">Bat: {r.batting || 'No data'}<br />Bowl: {r.bowling || 'No data'}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${r.name} up`} className={iconBtn}>Up</button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === rows.length - 1} aria-label={`Move ${r.name} down`} className={iconBtn}>Down</button>
                <button type="button" onClick={() => toggleCaptain(i)} aria-pressed={r.isCaptain} aria-label={`${r.name} is captain`} className={toggleBtn(r.isCaptain)}>C</button>
                <button type="button" onClick={() => toggleKeeper(i)} aria-pressed={r.isKeeper} aria-label={`${r.name} is wicketkeeper`} className={toggleBtn(r.isKeeper)}>WK</button>
                <button type="button" onClick={() => remove(i)} aria-label={`Remove ${r.name}`} className={`${iconBtn} ml-auto text-status-bad-ink`}>Remove</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setAdding(true)} className={btnQuiet}>Add players</button>
        {dirty ? (
          <span className="inline-flex flex-col">
            <button type="button" disabled className={btnQuiet}>Preview picture</button>
            <span className="mt-1 text-xs text-brand-grey">Save first: the picture shows the saved team.</span>
          </span>
        ) : (
          <Link href={`/selector/teams/${gameId}/preview-image`} target="_blank" className={btnQuiet}>Preview picture</Link>
        )}
      </div>

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-lg px-3 py-2 text-sm ring-1 ${message.tone === 'error' ? 'bg-status-bad-soft text-status-bad-ink ring-status-bad/25' : 'bg-status-ok-soft text-status-ok-ink ring-status-ok/25'}`}>
          {message.text}{' '}
          {message.toShare && <button type="button" className="font-semibold underline" onClick={goToShare}>Go to the picture and Facebook post</button>}
          {message.stale && <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Reload</button>}
        </p>
      )}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-6 border-t border-brand-black/10 bg-white/95 px-4 py-3 backdrop-blur sm:bottom-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSave} disabled={pending} className={dirty ? btnPrimary : btnQuiet}>{pending ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={onReady} disabled={pending || rows.length === 0} aria-pressed={ready} className={btnQuiet}>{ready ? 'Marked ready' : 'Mark ready'}</button>
          <button type="button" onClick={onPublishClick} disabled={pending || rows.length === 0 || blocking.length > 0} aria-describedby={publishBlockedBy ? 'publish-blocked' : undefined} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal ml-auto`}>{chip ? 'Publish changes' : 'Publish teams'}</button>
        </div>
        {publishBlockedBy && <p id="publish-blocked" className="mt-2 text-sm font-semibold text-status-bad-ink">Cannot publish yet: {publishBlockedBy}</p>}
        <p className="mt-2 text-xs text-brand-grey">Save keeps your work. Mark ready says you are happy with this team; it lets “Publish all ready” include it and does not publish anything. Publishing makes the team public.</p>
        {notReadyBecause && <p className="mt-1 text-xs font-semibold text-brand-gold-deep">{notReadyBecause}</p>}
      </div>

      <Sheet open={adding} title="Add players" onClose={() => setAdding(false)}>
        <div className="space-y-5">
          {GROUPS.map((g) => {
            const list = builder.candidates.filter((c) => c.answer === g.answer)
            if (!list.length) return null
            return (
              <section key={g.answer} aria-label={g.title}>
                <h3 className="text-sm font-bold uppercase tracking-wide text-brand-grey">{g.title} ({list.length})</h3>
                <ul className="mt-2 space-y-2">
                  {list.map((c) => {
                    const picked = rows.some((r) => r.playerId === c.id)
                    return (
                      <li key={c.id} className="flex items-center gap-3 rounded-lg p-2 ring-1 ring-brand-black/10">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-brand-black">{c.name}</p>
                          <p className="text-xs text-brand-grey">{ROLE_LABEL[c.role]} · Bat: {c.batting || 'No data'} · Bowl: {c.bowling || 'No data'}</p>
                          {c.note && <p className="text-xs italic text-brand-grey">“{c.note}”</p>}
                        </div>
                        <button type="button" disabled={picked} onClick={() => addCandidate(c)} className={`${picked ? iconBtn : btnQuiet} shrink-0`}>{picked ? 'In team' : 'Add'}</button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          {builder.candidates.length === 0 && <p className="text-brand-grey">There is nobody in this grade’s squad yet. Add players on the Squads page, or add a guest below.</p>}
          <section aria-label="Guest">
            <h3 className="text-sm font-bold uppercase tracking-wide text-brand-grey">Someone not on the list</h3>
            <p className="mt-1 text-sm text-brand-grey">A guest’s name is shown on the public teams page, so use their real name only (letters, no numbers).</p>
            <div className="mt-2 flex gap-2">
              <label className="sr-only" htmlFor="guest-name">Guest name</label>
              <input id="guest-name" value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={40} autoComplete="off" className={field} placeholder="First and last name" />
              <button type="button" onClick={addGuest} className={`${btnQuiet} shrink-0`}>Add guest</button>
            </div>
            {guestError && <p role="alert" className="mt-1 text-sm text-status-bad-ink">{guestError}</p>}
          </section>
        </div>
      </Sheet>

      <Sheet open={confirmOut != null} title="Add someone who is out?" onClose={() => setConfirmOut(null)}>
        <div className="space-y-4">
          <p className="text-brand-charcoal">{confirmOut?.name} said they are out for this game. Add them anyway?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => confirmOut && addCandidate(confirmOut)} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal`}>Add anyway</button>
            <button type="button" onClick={() => setConfirmOut(null)} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={confirming} title={chip ? 'Publish changes' : 'Publish teams'} onClose={() => !pending && setConfirming(false)}>
        <div className="space-y-4">
          <p className="text-brand-charcoal">This puts the whole team, {rows.length} {rows.length === 1 ? 'place' : 'places'}{rows.some((r) => r.playerId == null) ? ' (guest names included)' : ''}, on the public teams page and in the shareable picture. Anyone with the link can see it.</p>
          <p className="text-sm text-brand-grey">If you take the team down later, a picture Facebook or anyone else has already copied cannot be recalled.</p>
          {(serverWarnings ?? (nonBlocking.length ? nonBlocking.map((w) => ({ gradeName: fixture.gradeName, text: w.text })) : [])).length > 0 && (
            <div className="rounded-lg bg-brand-gold-pale p-3 ring-1 ring-brand-gold/30">
              <p className="text-sm font-bold text-brand-black">Warnings</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-brand-black">{(serverWarnings ?? nonBlocking.map((w) => ({ gradeName: '', text: w.text }))).map((w, i) => <li key={i}>{w.text}</li>)}</ul>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-brand-black">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-5 w-5" />
                Publish anyway
              </label>
            </div>
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="h-5 w-5" />
            Also post a site announcement for this weekend
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onPublish} disabled={pending || (nonBlocking.length > 0 && !acknowledged)} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal`}>{pending ? 'Publishing…' : chip ? 'Publish changes' : 'Publish teams'}</button>
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
