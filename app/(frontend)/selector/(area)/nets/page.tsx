import type { Metadata } from 'next'
import Link from 'next/link'
import { SessionForm } from '@/components/nets/session-form'
import { AvailabilitySectionNav } from '@/components/selector/section-nav'
import { selectorPaths } from '@/config/site'
import { NETS } from '@/lib/nets/constants'
import { getClub } from '@/lib/club'
import { listSessions, type SessionListRow } from '@/lib/nets-queries'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { requireSelection } from '@/lib/selector-auth'
import { createSessionAction } from '../../nets-actions'

export const metadata: Metadata = { title: 'Nets', robots: { index: false, follow: false } }

const STATE_LABEL = { planned: 'Planned', running: 'Running', paused: 'Paused', finished: 'Finished' } as const

function Row({ s, locale }: { s: SessionListRow; locale: string }) {
  const time = s.startTime ? ` at ${formatMatchTime(`${s.startTime}:00`)}` : ''
  return (
    <li>
      <Link href={selectorPaths.net(s.id)} className="flex min-h-14 items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-brand-black/10 hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
        <span>
          <span className="block font-bold text-brand-black">{s.title}</span>
          <span className="block text-sm text-brand-grey">{formatMatchDay(s.date, locale)}{time} · {STATE_LABEL[s.state]}</span>
        </span>
        <span className="shrink-0 text-right text-sm font-semibold text-brand-black">{s.turnedUp} turned up</span>
      </Link>
    </li>
  )
}

/** Net sessions: upcoming and past, and a new one. Reached from the Availability section. */
export default async function NetsPage() {
  const user = await requireSelection(selectorPaths.nets)
  const { locale } = await getClub()
  const { today, upcoming, past } = await listSessions(user)
  return (
    <main className="container-site max-w-xl py-6 sm:py-10">
      <AvailabilitySectionNav current="nets" />
      <h1 className="display text-3xl text-brand-black">Nets</h1>
      <p className="mt-2 text-sm text-brand-grey">Check in who turned up, make a rotation and run the timer. “Turned up” is attendance only, not a rating.</p>

      <h2 className="mt-6 text-xl font-bold text-brand-black">Upcoming</h2>
      {upcoming.length === 0 ? <p className="mt-2 text-sm text-brand-grey">No upcoming sessions.</p> : <ul className="mt-3 space-y-2">{upcoming.map((s) => <Row key={s.id} s={s} locale={locale} />)}</ul>}

      <section aria-labelledby="new" className="mt-8 rounded-xl bg-white p-4 ring-1 ring-brand-black/10">
        <h2 id="new" className="text-lg font-bold text-brand-black">New session</h2>
        <div className="mt-3">
          <SessionForm action={createSessionAction} submitLabel="Create session" defaults={{ title: '', date: today, startTime: '', nets: NETS.defaults.nets, minutesPerTurn: NETS.defaults.minutesPerTurn, groupSize: NETS.defaults.groupSize, notes: '' }} />
        </div>
      </section>

      <h2 className="mt-8 text-xl font-bold text-brand-black">Past</h2>
      {past.length === 0 ? <p className="mt-2 text-sm text-brand-grey">No past sessions yet.</p> : <ul className="mt-3 space-y-2">{past.map((s) => <Row key={s.id} s={s} locale={locale} />)}</ul>}
    </main>
  )
}
