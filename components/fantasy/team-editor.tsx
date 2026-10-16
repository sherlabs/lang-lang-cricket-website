'use client'

import { useMemo, useState, useTransition } from 'react'
import { btnPrimary, btnQuiet } from '@/components/selector/styles'
import { checkSquad } from '@/lib/fantasy/squad'
import { credits } from '@/lib/fantasy/rules'
import type { SaveResult } from '@/lib/fantasy/squads'
import type { PickerPlayer } from '@/lib/fantasy/queries'

type Props = {
  round: { key: string; label: string; lockText: string; locksAt: string } | null
  rules: { squadSize: number; salaryCapTenths: number; transfersPerRound: number; captainMultiplier: number }
  pool: PickerPlayer[]
  initialPicks: number[]
  initialCaptain: number | null
  previous: number[]
  minGames: number
  save: (input: { round: string; picks: number[]; captain: number | null }) => Promise<SaveResult>
}

/**
 * The squad picker: one column, no drag and drop, every control a real checkbox or radio button so it works by keyboard and on a
 * phone. The sticky bar shows the running total and the room left. The browser runs the same rule check the server runs on save
 * (the server's answer is the one that counts).
 */
export function TeamEditor({ round, rules, pool, initialPicks, initialCaptain, previous, minGames, save }: Props) {
  const [picks, setPicks] = useState<number[]>(initialPicks)
  const [captain, setCaptain] = useState<number | null>(initialCaptain)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [q, setQ] = useState('')
  // A snapshot taken when the page opens: the server applies the real lock on save.
  const [now] = useState(() => Date.now())
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool])
  const spent = picks.reduce((s, id) => s + (byId.get(id)?.priceTenths ?? 0), 0)
  const left = rules.salaryCapTenths - spent
  const open = round !== null && now < new Date(round.locksAt).getTime()
  const check = useMemo(
    () =>
      checkSquad({
        picks, captain, rules, previous: previous.length ? previous : null, now: new Date(now), lock: new Date(round?.locksAt ?? 0),
        pool: new Map(pool.map((p) => [p.id, { priceTenths: p.priceTenths, inGame: p.inGame }])),
      }),
    [picks, captain, rules, previous, pool, round, now],
  )
  const shown = pool.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))

  const toggle = (id: number) => {
    setMessage(null)
    setPicks((cur) => {
      if (cur.includes(id)) {
        if (captain === id) setCaptain(null)
        return cur.filter((x) => x !== id)
      }
      return cur.length >= rules.squadSize ? cur : [...cur, id]
    })
  }

  const onSave = () => {
    if (!round) return
    setMessage(null)
    start(async () => {
      const r = await save({ round: round.key, picks, captain })
      setMessage(r.ok ? { tone: 'ok', text: `Saved. Your squad costs ${credits(r.spentTenths)} credits.` } : { tone: 'bad', text: r.message })
    })
  }

  if (!round) return <p className="rounded-xl bg-white p-5 text-sm text-brand-grey ring-1 ring-brand-black/10">No round is open for changes right now. Your squad stays as it is.</p>
  const full = picks.length >= rules.squadSize
  return (
    <div className="space-y-4">
      <p role="status" className="rounded-lg bg-white px-4 py-3 text-sm text-brand-black ring-1 ring-brand-black/10">
        <strong>{open ? 'Open' : 'Locked'}:</strong> {round.label}. {open ? `Changes close at ${round.lockText}.` : `Squads locked at ${round.lockText}.`}
        {rules.transfersPerRound > 0 && open && previous.length > 0 ? ` You can change ${rules.transfersPerRound} ${rules.transfersPerRound === 1 ? 'player' : 'players'} this round.` : ''}
      </p>
      <p className="text-xs leading-relaxed text-brand-grey">A price is a ranking of points per game, not a rating of how good a player is. Players with fewer than {minGames} games are priced near the middle by design.</p>
      <label className="block text-sm font-medium text-brand-black">
        Find a player
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" className="mt-1 block h-12 w-full rounded-lg border border-brand-black/20 bg-white px-3 text-base text-brand-black focus:border-brand-gold-deep focus:outline-none focus:ring-2 focus:ring-brand-gold/50" autoComplete="off" />
      </label>
      <ul className="divide-y divide-brand-black/5 rounded-xl bg-white ring-1 ring-brand-black/10">
        {shown.map((p) => {
          const on = picks.includes(p.id)
          const disabled = !open || (!on && (full || !p.inGame))
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <input id={`pick-${p.id}`} type="checkbox" checked={on} disabled={disabled && !on} onChange={() => toggle(p.id)} className="h-6 w-6 shrink-0" aria-describedby={`pick-info-${p.id}`} />
              <label htmlFor={`pick-${p.id}`} className="min-w-0 flex-1 py-1">
                <span className="block truncate text-base font-medium text-brand-black">{p.name}{!p.inGame && <span className="ml-2 text-xs font-normal text-status-bad-ink">no longer in the game</span>}</span>
                <span id={`pick-info-${p.id}`} className="block text-xs text-brand-grey">
                  {p.role ?? 'Player'} · {p.games ? `${p.perGame ?? 0} pts/game over ${p.games} ${p.games === 1 ? 'game' : 'games'}` : 'no games yet'}
                  {p.thin ? ` · based on ${p.games ?? 0} ${p.games === 1 ? 'game' : 'games'}, priced near the middle` : ''}
                </span>
              </label>
              <span className="shrink-0 text-right text-sm font-semibold text-brand-black">{credits(p.priceTenths)}</span>
              {on && (
                <label className="flex min-h-11 shrink-0 items-center gap-1 text-xs text-brand-black">
                  <input type="radio" name="captain" checked={captain === p.id} onChange={() => { setCaptain(p.id); setMessage(null) }} className="h-5 w-5" disabled={!open} />
                  Captain
                </label>
              )}
            </li>
          )
        })}
        {shown.length === 0 && <li className="px-3 py-4 text-sm text-brand-grey">No player matches that name.</li>}
      </ul>
      <div className="sticky bottom-0 -mx-5 border-t border-brand-black/10 bg-white/95 px-5 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-brand-black" aria-live="polite">
          <span><strong>{picks.length}</strong> of {rules.squadSize} players</span>
          <span>Spent <strong>{credits(spent)}</strong> of {credits(rules.salaryCapTenths)}</span>
          <span className={left < 0 ? 'font-semibold text-status-bad-ink' : ''}>{left < 0 ? `Over the cap by ${credits(-left)}` : `${credits(left)} left`}</span>
        </div>
        {!check.ok && picks.length > 0 && open && check.code !== 'captain' && <p className="mt-1 text-xs text-brand-grey">{check.message}</p>}
        {!check.ok && picks.length === rules.squadSize && check.code === 'captain' && open && <p className="mt-1 text-xs text-brand-grey">Choose a captain: their points count {rules.captainMultiplier} times.</p>}
        {message && <p role="alert" className={`mt-2 rounded-lg px-3 py-2 text-sm ${message.tone === 'ok' ? 'bg-status-ok-soft text-status-ok-ink' : 'bg-status-bad-soft text-status-bad-ink'}`}>{message.text}</p>}
        <div className="mt-3 flex gap-2">
          <button type="button" className={`${btnPrimary} flex-1`} onClick={onSave} disabled={pending || !open || !check.ok}>{pending ? 'Saving...' : 'Save squad'}</button>
          <button type="button" className={btnQuiet} onClick={() => { setPicks(initialPicks); setCaptain(initialCaptain); setMessage(null) }} disabled={pending}>Undo</button>
        </div>
      </div>
    </div>
  )
}
