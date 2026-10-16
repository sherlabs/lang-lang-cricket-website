import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConfirmButton } from '@/components/selector/confirm-button'
import { CheckIn } from '@/components/nets/check-in'
import { RotationTimer } from '@/components/nets/rotation-timer'
import { SessionForm } from '@/components/nets/session-form'
import { AvailabilitySectionNav } from '@/components/selector/section-nav'
import { btnQuiet } from '@/components/selector/styles'
import { selectorPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { getNetDetail } from '@/lib/nets-queries'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { requireSelection } from '@/lib/selector-auth'
import { addGuestAction, buildRotationAction, checkInAction, checkOutAction, deleteSessionAction, finishSessionAction, nextRoundAction, pauseSessionAction, resumeSessionAction, searchPlayersAction, startSessionAction, updateSessionAction } from '../../../nets-actions'

export const metadata: Metadata = { title: 'Net session', robots: { index: false, follow: false } }

type Props = { params: Promise<{ id: string }> }

const STATE_LABEL = { planned: 'Planned', running: 'Running', paused: 'Paused', finished: 'Finished' } as const

/** One net session on one phone page: check in, rotation and timer, summary. */
export default async function NetSessionPage({ params }: Props) {
  const { id: raw } = await params
  const user = await requireSelection(/^\d{1,9}$/.test(raw) ? selectorPaths.net(raw) : selectorPaths.nets)
  if (!/^\d{1,9}$/.test(raw)) notFound()
  const { locale } = await getClub()
  const d = await getNetDetail(user, Number(raw))
  if (!d) notFound()
  const s = d.snapshot
  const notHere = d.squad.filter((p) => !p.present)
  const time = d.startTime ? ` at ${formatMatchTime(`${d.startTime}:00`)}` : ''
  // While a session runs, the timer and its buttons come first: the check-in roster is 20 to 30 tall rows.
  const live = s.state === 'running' || s.state === 'paused'
  const checkInSection = (
  <section aria-labelledby="checkin" className="mt-8">
    <h2 id="checkin" className="text-xl font-bold text-brand-black">Check in</h2>
    <p className="mt-1 text-sm text-brand-grey">Tap a name when they turn up. This records attendance only.</p>
    <div className="mt-3">
      <CheckIn sessionId={s.id} squad={d.squad} others={d.others} guestsLeft={d.guestsLeft} actions={{ checkIn: checkInAction, checkOut: checkOutAction, addGuest: addGuestAction, search: searchPlayersAction }} />
    </div>
  </section>
  )
  const rotationSection = (
  <section aria-labelledby="rotation" className="mt-6">
    <h2 id="rotation" className="text-xl font-bold text-brand-black">Rotation</h2>
    {d.planStale && <p role="status" className="mt-2 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">Check-ins have changed since the rotation was built. Build it again before you start.</p>}
    {s.state !== 'planned' && s.state !== 'finished' && <p className="mt-1 text-sm text-brand-grey">Anyone who checks in now joins a later round. Rounds already started are not changed.</p>}
    <div className="mt-3">
      <RotationTimer
        key={s.id}
        initial={s}
        statePath={selectorPaths.netState(s.id)}
        canBuild={s.state === 'planned'}
        actions={{ build: buildRotationAction, start: startSessionAction, pause: pauseSessionAction, resume: resumeSessionAction, next: nextRoundAction, finish: finishSessionAction }}
      />
    </div>
    <p className="mt-3 text-xs text-brand-grey">The timer is a convenience. A phone may show a stale countdown until you return to this tab, and not every browser can keep the screen on.</p>
  </section>
  )
  return (
    <main className="container-site max-w-xl py-6 sm:py-10">
      <AvailabilitySectionNav current="nets" />
      <p className="text-sm"><Link href={selectorPaths.nets} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">All sessions</Link></p>
      <h1 className="display text-3xl text-brand-black">{s.title}</h1>
      <p className="mt-1 text-sm text-brand-grey">{formatMatchDay(s.date, locale)}{time} · {s.nets} {s.nets === 1 ? 'net' : 'nets'}, {s.minutesPerTurn} minutes each, up to {s.groupSize} per net · <span className="font-semibold text-brand-black">{STATE_LABEL[s.state]}</span></p>
      {d.notes && <p className="mt-2 text-sm text-brand-charcoal">{d.notes}</p>}

      {live && rotationSection}
      {s.state !== 'finished' && checkInSection}
      {!live && rotationSection}

      <section aria-labelledby="summary" className="mt-8">
        <h2 id="summary" className="text-xl font-bold text-brand-black">Summary</h2>
        <p className="mt-1 text-brand-charcoal"><span className="font-semibold">{d.attendees.length} turned up</span>{d.attendees.length ? `: ${d.attendees.map((a) => a.name + (a.isGuest ? ' (guest)' : '')).join(', ')}` : '.'}</p>
        {notHere.length > 0 && <p className="mt-2 text-sm text-brand-grey"><span className="font-semibold">In a squad, not checked in:</span> {notHere.map((p) => p.name).join(', ')}</p>}
        {s.plan && s.plan.groups.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-bold uppercase tracking-wide text-brand-grey">Groups</h3>
            <ul className="mt-1 space-y-1 text-sm text-brand-charcoal">
              {s.plan.groups.map((g) => (
                <li key={g.number}><span className="font-semibold">Round {g.round + 1}, net {g.net}</span>: {g.players.map((p) => p.name).join(', ')}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      {s.state === 'planned' && (
        <details className="mt-8 rounded-xl bg-white p-4 ring-1 ring-brand-black/10">
          <summary className="min-h-11 cursor-pointer py-2 font-bold text-brand-black">Edit this session</summary>
          <div className="mt-3">
            <SessionForm action={updateSessionAction} submitLabel="Save changes" defaults={{ sessionId: s.id, title: s.title, date: s.date, startTime: d.startTime ?? '', nets: s.nets, minutesPerTurn: s.minutesPerTurn, groupSize: s.groupSize, notes: d.notes ?? '' }} />
          </div>
          {d.canDelete && (
            <form action={deleteSessionAction} className="mt-4">
              <input type="hidden" name="sessionId" value={s.id} />
              <ConfirmButton label="Delete this session" confirmLabel="Really delete it and its check-ins?" className={btnQuiet} />
            </form>
          )}
        </details>
      )}
    </main>
  )
}
