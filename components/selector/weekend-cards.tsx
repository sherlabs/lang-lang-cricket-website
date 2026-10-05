import Link from 'next/link'
import { CLUB_LOCALE, selectorPaths } from '@/config/site'
import { ANSWER_DOT } from '@/lib/availability'
import { formatMatchDay, formatMatchTime, personTag } from '@/lib/selection/lineup-text'
import { telHref } from '@/lib/selection/phone'
import { PUBLISH_CHIP_LABEL, TEAM_STATUS_LABEL } from '@/lib/team-status'
import type { BoardFixture, WeekendBoard } from '@/lib/selector-team-queries'
import { btnQuiet } from './styles'
import { CopyButton } from './ui'

const tone: Record<string, string> = {
  'not-started': 'bg-brand-black/10 text-brand-black',
  'in-progress': 'bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30',
  ready: 'bg-emerald-100 text-emerald-900',
  'needs-attention': 'bg-red-100 text-red-900',
}

const when = (f: BoardFixture['fixture']) => [formatMatchDay(f.localDate, CLUB_LOCALE), formatMatchTime(f.localTime)].filter(Boolean).join(' ')

function Chips({ b }: { b: BoardFixture }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold ${tone[b.view.status]}`}>{TEAM_STATUS_LABEL[b.view.status]}</span>
      {b.view.chip && <span className="inline-flex min-h-8 items-center rounded-full bg-brand-black px-3 text-sm font-semibold text-brand-gold">{PUBLISH_CHIP_LABEL[b.view.chip]}</span>}
    </div>
  )
}

/** The all-teams view: one card per grade with the XI, status, warning count and who last edited. Not-started cards open the builder. */
export function TeamCards({ board }: { board: WeekendBoard }) {
  return (
    <ul className="mt-4 grid gap-4 md:grid-cols-2">
      {board.fixtures.map((b) => {
        const f = b.fixture
        const started = b.view.slots.length > 0
        return (
          <li key={f.id}>
            <Link href={selectorPaths.team(f.gameId)} className="block rounded-xl bg-white p-4 ring-1 ring-brand-black/10 transition hover:ring-brand-gold-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-grey">{f.gradeName}</p>
              <p className="mt-0.5 text-lg font-bold text-brand-black">v {f.opponentName}</p>
              <p className="text-sm text-brand-grey">{[when(f), f.venueName].filter(Boolean).join(' · ')}</p>
              <div className="mt-2"><Chips b={b} /></div>
              {started ? (
                <ol className="mt-3 space-y-0.5 text-sm text-brand-charcoal">
                  {b.view.slots.map((s) => (
                    <li key={s.key}><span className="inline-block w-6 tabular-nums text-brand-grey">{s.order}.</span>{s.name}{personTag(s)}</li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 font-semibold text-brand-gold-deep">Not started. Tap to pick the team.</p>
              )}
              <p className="mt-3 text-xs text-brand-grey">
                {b.view.warnings.length ? `${b.view.warnings.length} ${b.view.warnings.length === 1 ? 'warning' : 'warnings'}` : 'No warnings'}
                {b.view.updatedByName && b.view.updatedAt ? ` · last edited by ${b.view.updatedByName}` : ''}
              </p>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** The match-day overview: per grade, replies, who has not replied (tap to call, copy a reminder), keeper and selection status. */
export function OverviewCards({ board }: { board: WeekendBoard }) {
  return (
    <ul className="mt-4 grid gap-4 md:grid-cols-2">
      {board.fixtures.map((b) => {
        const f = b.fixture
        const t = b.availability.tally
        const noKeeperTagged = !b.view.slots.some((s) => s.isKeeper)
        return (
          <li key={f.id} className="rounded-xl bg-white p-4 ring-1 ring-brand-black/10">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-grey">{f.gradeName}</p>
            <p className="mt-0.5 text-lg font-bold text-brand-black">v {f.opponentName}</p>
            <p className="text-sm text-brand-grey">{when(f)}</p>
            <div className="mt-2"><Chips b={b} /></div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center" aria-label="Replies">
              {([['in', 'In', t.in], ['maybe', 'Maybe', t.maybe], ['out', 'Out', t.out], ['none', 'No reply', t.none]] as const).map(([k, label, n]) => (
                <div key={k} className="rounded-lg bg-brand-black/5 px-1 py-2">
                  <dt className="flex items-center justify-center gap-1 text-xs font-semibold text-brand-grey"><span aria-hidden className={`h-2 w-2 rounded-full ${ANSWER_DOT[k]}`} />{label}</dt>
                  <dd className="text-xl font-bold tabular-nums text-brand-black">{n}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-3 space-y-1 text-sm">
              {b.availability.squadSize === 0 && <li className="font-semibold text-brand-gold-deep">No squad for this grade yet. Add players on the Squads page.</li>}
              {!b.availability.keeperAvailable && b.availability.squadSize > 0 && <li className="font-semibold text-red-800">No wicketkeeper available (nobody marked as a keeper has replied in or maybe).</li>}
              {b.view.slots.length > 0 && noKeeperTagged && <li className="font-semibold text-red-800">No keeper tagged in the team.</li>}
              {b.view.status === 'not-started' && <li className="font-semibold text-brand-gold-deep">Selection not started.</li>}
            </ul>
            {b.availability.noReply.length > 0 && (
              <details className="mt-3">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-black">Who has not replied ({b.availability.noReply.length})</summary>
                <ul className="mt-1 space-y-1">
                  {b.availability.noReply.map((n) => {
                    const tel = telHref(n.phone)
                    return (
                      <li key={n.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={selectorPaths.player(n.slug)} className="underline-offset-4 hover:underline">{n.name}</Link>
                        {tel && <a href={tel} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Call</a>}
                      </li>
                    )
                  })}
                </ul>
                <div className="mt-2"><CopyButton text={b.reminder} label="Copy a reminder text" className={btnQuiet} /></div>
              </details>
            )}
            <p className="mt-3"><Link href={selectorPaths.team(f.gameId)} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">{b.view.slots.length ? 'Open the team' : 'Pick the team'}</Link></p>
          </li>
        )
      })}
    </ul>
  )
}
