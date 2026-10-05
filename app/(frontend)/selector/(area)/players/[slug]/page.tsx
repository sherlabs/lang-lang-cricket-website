import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CodeForm, FieldsForm, PhoneForm, PinForm } from '@/components/selector/player-forms'
import { CLUB_COUNTRY, selectorPaths } from '@/config/site'
import { formatPhone, telHref } from '@/lib/selection/phone'
import { requireSelection } from '@/lib/selector-auth'
import { getPlayerCard } from '@/lib/selector-profile-queries'
import { issueCodeAction, saveFieldsAction, savePhoneAction, setPinAction } from '../../../board-actions'

export const metadata: Metadata = { title: 'Player', robots: { index: false, follow: false } }

type Props = { params: Promise<{ slug: string }> }

/** A player's private card: phone, PIN, one-time code, role and notes. Form, availability trends and last-5 scores arrive with team selection. */
export default async function PlayerCardPage({ params }: Props) {
  const { slug } = await params
  const user = await requireSelection(selectorPaths.player(slug))
  const card = await getPlayerCard(user, slug)
  if (!card) notFound()
  const { player, profile } = card
  const tel = telHref(profile.phone)
  return (
    <main className="container-site max-w-xl py-6 sm:py-10">
      <h1 className="display text-3xl text-brand-black">{player.name}</h1>
      {player.hidden && <p className="mt-2 text-sm text-brand-grey">This player is hidden on the public site.</p>}
      <p className="mt-2 flex flex-wrap gap-4 text-sm">
        {tel && <a href={tel} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Call {formatPhone(profile.phone!, CLUB_COUNTRY)}</a>}
        {!player.hidden && <Link href={`/players/${player.slug}`} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Public profile</Link>}
        <Link href={selectorPaths.squads} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Squads</Link>
      </p>
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
