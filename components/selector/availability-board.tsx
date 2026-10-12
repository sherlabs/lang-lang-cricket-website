'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { ANSWER_DOT, ANSWER_LABEL, tally, type Answer } from '@/lib/availability'
import { formatLocalDate, formatLocalTime } from '@/lib/playhq/format'
import { formatPhone, telHref } from '@/lib/selection/phone'
import { ROLE_LABEL } from '@/lib/selection/roles'
import type { AvailabilityBoard } from '@/lib/selector-availability-queries'
import { setAnswerAction } from '@/app/(frontend)/selector/board-actions'
import { field } from './styles'

const ORDER = ['in', 'maybe', 'out'] as const
const ON: Record<(typeof ORDER)[number], string> = { in: 'bg-status-ok text-white', maybe: 'bg-status-warn text-brand-black', out: 'bg-status-bad text-white' }
const CELL: Record<Answer, string> = { in: 'bg-status-ok-soft text-status-ok-ink', maybe: 'bg-status-warn-soft text-status-warn-ink', out: 'bg-status-bad-soft text-status-bad-ink', none: 'bg-brand-stone/60 text-brand-grey' }

type Props = { board: Pick<AvailabilityBoard, 'fixtures' | 'players'>; country: string }

/**
 * The availability board. A phone shows one game at a time: a list of players with a three-way control (In, Maybe, Out; tap the
 * chosen one again to clear) and a tap-to-call link. A wide screen also gets the players-by-games matrix, with a name column that
 * stays put while the rest scrolls inside its own box. Answers change at once and are saved in the background.
 */
export function AvailabilityBoardView({ board, country }: Props) {
  const [selected, setSelected] = useState(board.fixtures[0]?.id ?? 0)
  const [noReplyOnly, setNoReplyOnly] = useState(false)
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => Object.fromEntries(board.players.flatMap((p) => board.fixtures.map((f) => [`${p.id}:${f.id}`, p.answers[f.id] ?? 'none'] as const))))
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const answerOf = (playerId: number, fixtureId: number): Answer => answers[`${playerId}:${fixtureId}`] ?? 'none'
  const fixture = board.fixtures.find((f) => f.id === selected) ?? board.fixtures[0]
  const tallies = useMemo(() => Object.fromEntries(board.fixtures.map((f) => [f.id, tally(board.players.map((p) => answers[`${p.id}:${f.id}`] ?? 'none'))])), [board, answers])

  const set = (playerId: number, fixtureId: number, next: Answer) => {
    const key = `${playerId}:${fixtureId}`
    const before = answers[key] ?? 'none'
    setAnswers((a) => ({ ...a, [key]: next }))
    setError('')
    startTransition(async () => {
      const res = await setAnswerAction({ playerId, fixtureId, status: next })
      if (!res.ok) {
        setAnswers((a) => ({ ...a, [key]: before }))
        setError(res.error)
      }
    })
  }

  if (!fixture) return null
  const t = tallies[fixture.id]
  const visible = board.players.filter((p) => !noReplyOnly || answerOf(p.id, fixture.id) === 'none')

  return (
    <div>
      <div role="group" aria-label="Games" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        {board.fixtures.map((f) => {
          const ft = tallies[f.id]
          const on = f.id === fixture.id
          return (
            <button key={f.id} type="button" aria-pressed={on} onClick={() => setSelected(f.id)} className={`min-h-14 shrink-0 rounded-lg px-3 py-2 text-left text-sm ${on ? 'bg-brand-black text-white' : 'border border-brand-black/20 bg-white text-brand-black'}`}>
              <span className="block font-semibold">{formatLocalDate(f.localDate, { weekday: true }).replace(/ \d{4}$/, '')}</span>
              <span className="block max-w-[10rem] truncate">v {f.opponentName}</span>
              <span className="block text-xs">{ft.in} in · {ft.maybe} maybe · {ft.out} out · {ft.none} no reply</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-brand-black/10">
        <h2 className="text-lg font-bold text-brand-black">{fixture.roundName ? `${fixture.roundName} ` : ''}v {fixture.opponentName}</h2>
        <p className="text-sm text-brand-grey">
          {formatLocalDate(fixture.localDate)}{formatLocalTime(fixture.localTime) ? `, ${formatLocalTime(fixture.localTime)}` : ''} · {fixture.isHome ? 'Home' : 'Away'}{fixture.venueName ? ` · ${fixture.venueName}` : ''}
        </p>
        <p className="mt-3 text-sm font-semibold text-brand-black" aria-live="polite">
          {t.in} in · {t.maybe} maybe · {t.out} out · {t.none} no reply
        </p>
        <label className="mt-3 flex min-h-11 items-center gap-3 text-sm text-brand-black">
          <input type="checkbox" checked={noReplyOnly} onChange={(e) => setNoReplyOnly(e.target.checked)} className="size-5" />
          Show only players who have not replied
        </label>
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{error}</p>}

      {board.players.length === 0 ? (
        <p className="mt-4 text-sm text-brand-grey">No one is in this grade&apos;s squad yet. Add players on the Squads page.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((p) => {
            const current = answerOf(p.id, fixture.id)
            const tel = telHref(p.phone)
            return (
              <li key={p.id} className="rounded-xl bg-white p-3 ring-1 ring-brand-black/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/selector/players/${p.slug}`} className="block truncate font-semibold text-brand-black underline-offset-4 hover:underline">{p.name}</Link>
                    <p className="text-xs text-brand-grey">
                      {p.role ? `${ROLE_LABEL[p.role]} · ` : ''}
                      {current === 'none' ? 'No reply' : `Said ${ANSWER_LABEL[current].toLowerCase()}`}
                      {p.notes[fixture.id] ? ` · "${p.notes[fixture.id]}"` : ''}
                    </p>
                  </div>
                  {tel ? (
                    <a href={tel} className="inline-flex min-h-11 items-center rounded-lg border border-brand-black/20 px-3 text-sm font-semibold text-brand-black" aria-label={`Call ${p.name}`}>Call {formatPhone(p.phone!, country)}</a>
                  ) : (
                    <span className="text-xs text-brand-grey">No phone</span>
                  )}
                </div>
                <div role="group" aria-label={`Availability for ${p.name}`} className="mt-3 grid grid-cols-3 gap-2">
                  {ORDER.map((s) => {
                    const on = current === s
                    return (
                      <button key={s} type="button" aria-pressed={on} onClick={() => set(p.id, fixture.id, on ? 'none' : s)} className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${on ? ON[s] : 'bg-white text-brand-black ring-1 ring-brand-black/20'}`}>
                        {ANSWER_LABEL[s]}
                      </button>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {noReplyOnly && visible.length === 0 && board.players.length > 0 && <p className="mt-4 text-sm text-brand-grey">Everyone has replied for this game.</p>}
      <p className="mt-3 text-xs text-brand-grey">Tap the chosen answer again to clear it.</p>

      <section aria-labelledby="matrix" className="mt-8 hidden md:block">
        <h2 id="matrix" className="text-lg font-bold text-brand-black">All games</h2>
        <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl ring-1 ring-brand-black/10">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 bg-white px-3 py-2 text-left font-semibold text-brand-black">Player</th>
                {board.fixtures.map((f) => (
                  <th key={f.id} className="sticky top-0 z-10 min-w-32 bg-white px-2 py-2 text-left text-xs font-semibold text-brand-black">
                    {formatLocalDate(f.localDate, { weekday: true }).replace(/ \d{4}$/, '')}
                    <span className="block font-normal text-brand-grey">v {f.opponentName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.players.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1 text-left font-medium text-brand-black">{p.name}</th>
                  {board.fixtures.map((f) => {
                    const a = answerOf(p.id, f.id)
                    return (
                      <td key={f.id} className="px-1 py-1">
                        <select aria-label={`${p.name}, ${formatLocalDate(f.localDate)}`} value={a} onChange={(e) => set(p.id, f.id, e.target.value as Answer)} className={`${field} h-10 text-sm font-semibold ${CELL[a]}`}>
                          <option value="none">{ANSWER_LABEL.none}</option>
                          {ORDER.map((s) => <option key={s} value={s}>{ANSWER_LABEL[s]}</option>)}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr>
                <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs text-brand-grey">In / maybe / out / no reply</th>
                {board.fixtures.map((f) => (
                  <td key={f.id} className="px-2 py-2 text-xs text-brand-grey">{tallies[f.id].in} / {tallies[f.id].maybe} / {tallies[f.id].out} / {tallies[f.id].none}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex items-center gap-4 text-xs text-brand-grey">
          {(['in', 'maybe', 'out', 'none'] as const).map((a) => (
            <span key={a} className="inline-flex items-center gap-1"><span className={`size-2.5 rounded-full ${ANSWER_DOT[a]}`} aria-hidden />{ANSWER_LABEL[a]}</span>
          ))}
        </p>
      </section>
    </div>
  )
}
