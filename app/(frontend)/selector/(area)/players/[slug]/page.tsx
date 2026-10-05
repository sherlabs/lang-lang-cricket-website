import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ANSWER_DOT, ANSWER_LABEL } from '@/lib/availability'
import { CodeForm, FieldsForm, PhoneForm, PinForm } from '@/components/selector/player-forms'
import { CLUB_COUNTRY, selectorPaths } from '@/config/site'
import { formatMatchDay } from '@/lib/selection/lineup-text'
import { formatPhone, telHref } from '@/lib/selection/phone'
import { ROLE_LABEL } from '@/lib/selection/roles'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { getPlayerCard } from '@/lib/selector-profile-queries'
import { loadPlayerExtras } from '@/lib/selector-team-queries'
import { issueCodeAction, saveFieldsAction, savePhoneAction, setPinAction } from '../../../board-actions'

export const metadata: Metadata = { title: 'Player', robots: { index: false, follow: false } }

type Props = { params: Promise<{ slug: string }> }

/** A player's private card: role, last five scores, the next month's availability, phone, PIN, one-time code and notes. */
export default async function PlayerCardPage({ params }: Props) {
  const { slug } = await params
  const user = await requireSelection(selectorPaths.player(slug))
  const { locale } = await getClub()
  const card = await getPlayerCard(user, slug)
  if (!card) notFound()
  const { player, profile } = card
  const tel = telHref(profile.phone)
  const extras = await loadPlayerExtras(user, player.id)
  const role = profile.role ?? (profile.canKeep ? 'keeper' : extras.suggested)
  return (
    <main className="container-site max-w-xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black">{player.name}</h1>
      {player.hidden && <p className="mt-2 text-sm text-brand-grey">This player is hidden on the public site.</p>}
      <p className="mt-2 flex flex-wrap gap-4 text-sm">
        {tel && <a href={tel} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Call {formatPhone(profile.phone!, CLUB_COUNTRY)}</a>}
        {!player.hidden && <Link href={`/players/${player.slug}`} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Public profile</Link>}
        <Link href={selectorPaths.squads} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Squads</Link>
      </p>
      <p className="mt-3 inline-flex rounded-full bg-brand-black/5 px-3 py-1 text-sm font-semibold text-brand-black">{ROLE_LABEL[role]}{!profile.role && !profile.canKeep && role !== 'unknown' ? ' (a guess from the stats)' : ''}</p>
      <section aria-labelledby="form" className="mt-6">
        <h2 id="form" className="text-lg font-bold text-brand-black">Recent form</h2>
        <dl className="mt-2 space-y-1 text-brand-charcoal">
          <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">Batting</dt><dd>{extras.batting}</dd></div>
          <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">Bowling</dt><dd>{extras.bowling}</dd></div>
        </dl>
        <p className="mt-1 text-xs text-brand-grey">Last five games with stored scores, newest first (* not out). A prompt, not a verdict.</p>
      </section>
      <section aria-labelledby="next" className="mt-6">
        <h2 id="next" className="text-lg font-bold text-brand-black">Next month</h2>
        {extras.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-brand-grey">No upcoming games for the squads this player is in.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {extras.upcoming.map((u) => (
              <li key={u.fixtureId} className="flex items-center gap-2 text-sm text-brand-charcoal">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${ANSWER_DOT[u.answer]}`} />
                <span className="font-semibold">{ANSWER_LABEL[u.answer]}</span>
                <span className="text-brand-grey">{formatMatchDay(u.localDate, locale)} v {u.opponentName} ({u.gradeName}){u.note ? `, “${u.note}”` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="phone" className="mt-6">
        <h2 id="phone" className="text-lg font-bold text-brand-black">Phone</h2>
        <div className="mt-3"><PhoneForm action={savePhoneAction} playerId={player.id} phone={profile.phone} display={profile.phone ? formatPhone(profile.phone, CLUB_COUNTRY) : ''} /></div>
      </section>
      <section aria-labelledby="pin" className="mt-8">
        <h2 id="pin" className="text-lg font-bold text-brand-black">PIN for the player link</h2>
        <div className="mt-3"><PinForm action={setPinAction} playerId={player.id} profile={profile} /></div>
        <div className="mt-6"><CodeForm action={issueCodeAction} playerId={player.id} active={profile.oneTimeCodeActive} /></div>
      </section>
      <section aria-labelledby="sel" className="mt-8">
        <h2 id="sel" className="text-lg font-bold text-brand-black">For selection</h2>
        <div className="mt-3"><FieldsForm action={saveFieldsAction} playerId={player.id} profile={profile} /></div>
      </section>
    </main>
  )
}
