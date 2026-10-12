'use client'

import { useRef, useState, useTransition } from 'react'
import { AVAILABILITY } from '@/config/site'
import { ANSWER_LABEL, type Answer } from '@/lib/availability'
import type { PlayerFixtureView } from '@/lib/availability-public'
import { formatLocalDate, formatLocalTime } from '@/lib/playhq/format'
import { field } from '@/components/selector/styles'
import { answerAction } from '@/app/(frontend)/availability/[token]/actions'

const ORDER = ['in', 'maybe', 'out'] as const
const ON: Record<(typeof ORDER)[number], string> = { in: 'bg-status-ok text-white', maybe: 'bg-status-warn text-brand-black', out: 'bg-status-bad text-white' }

/** Big In / Maybe / Out buttons per game. The page never shows anyone else's answers. */
export function AnswerList({ token, fixtures }: { token: string; fixtures: PlayerFixtureView[] }) {
  const [answers, setAnswers] = useState<Record<number, Answer>>(() => Object.fromEntries(fixtures.map((f) => [f.id, f.answer])))
  const [notes, setNotes] = useState<Record<number, string>>(() => Object.fromEntries(fixtures.map((f) => [f.id, f.note])))
  const [messages, setMessages] = useState<Record<number, string>>({})
  const [closedNow, setClosedNow] = useState<Record<number, boolean>>({})
  const [, start] = useTransition()
  const savedNotes = useRef<Record<number, string>>(Object.fromEntries(fixtures.map((f) => [f.id, f.note])))

  const save = (f: PlayerFixtureView, status: Answer) => {
    if (status === 'none') return
    const before = answers[f.id]
    setAnswers((a) => ({ ...a, [f.id]: status }))
    setMessages((m) => ({ ...m, [f.id]: '' }))
    const note = notes[f.id] ?? ''
    start(async () => {
      const res = await answerAction({ token, fixtureId: f.id, status, note })
      if (res.ok) {
        savedNotes.current[f.id] = note
        setMessages((m) => ({ ...m, [f.id]: 'Saved.' }))
      } else {
        setAnswers((a) => ({ ...a, [f.id]: before }))
        setMessages((m) => ({ ...m, [f.id]: res.message }))
        if (res.code === 'closed') setClosedNow((c) => ({ ...c, [f.id]: true }))
      }
    })
  }

  return (
    <ul className="space-y-4">
      {fixtures.map((f) => {
        const closed = f.closed || closedNow[f.id]
        const time = formatLocalTime(f.localTime)
        return (
          <li key={f.id} className="rounded-2xl bg-white p-4 ring-1 ring-brand-black/10">
            <h2 className="text-lg font-bold text-brand-black">{formatLocalDate(f.localDate)}{time ? `, ${time}` : ''}</h2>
            <p className="text-sm text-brand-grey">{f.gradeName} v {f.opponentName} · {f.isHome ? 'Home' : 'Away'}{f.venue ? ` · ${f.venue}` : ''}</p>
            {closed ? (
              <p className="mt-3 rounded-lg bg-brand-stone px-3 py-2 text-sm text-brand-black">Selection has started for this game, so answers are closed. Please call a selector to change yours. {answers[f.id] !== 'none' ? `Your answer: ${ANSWER_LABEL[answers[f.id]]}.` : ''}</p>
            ) : (
              <>
                <div role="group" aria-label={`Can you play on ${formatLocalDate(f.localDate)}?`} className="mt-3 grid grid-cols-3 gap-2">
                  {ORDER.map((s) => (
                    <button key={s} type="button" aria-pressed={answers[f.id] === s} onClick={() => save(f, s)} className={`min-h-14 rounded-xl px-2 text-base font-bold ${answers[f.id] === s ? ON[s] : 'bg-white text-brand-black ring-1 ring-brand-black/25'}`}>
                      {ANSWER_LABEL[s]}
                    </button>
                  ))}
                </div>
                <label className="mt-3 block text-sm font-medium text-brand-black">
                  A note for the selectors (optional)
                  <input className={`${field} mt-1`} value={notes[f.id] ?? ''} maxLength={AVAILABILITY.noteMax} onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} onBlur={() => { if (answers[f.id] !== 'none' && (notes[f.id] ?? '') !== (savedNotes.current[f.id] ?? '')) save(f, answers[f.id]) }} placeholder="For example: can only play if I can bat early" />
                  {answers[f.id] === 'none' && <span className="mt-1 block text-xs text-brand-grey">Tap In, Maybe or Out above; your note is saved with your answer.</span>}
                </label>
              </>
            )}
            <p role="status" className="mt-2 min-h-5 text-sm text-brand-grey">{messages[f.id]}</p>
          </li>
        )
      })}
    </ul>
  )
}
