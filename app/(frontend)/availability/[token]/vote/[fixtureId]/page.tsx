import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { BallotForm } from '@/components/votes/ballot-form'
import { btnQuiet } from '@/components/selector/styles'
import { availabilityPath, VOTES } from '@/config/site'
import { availCookieName } from '@/lib/availability-link'
import { LOCKED_MESSAGE } from '@/lib/availability-throttle'
import { getClub } from '@/lib/club'
import { formatMatchDay } from '@/lib/selection/lineup-text'
import { getPayloadClient } from '@/lib/payload/client'
import { loadVoteView } from '@/lib/votes-queries'
import { BALLOT_MESSAGES, voteWord, type BallotError } from '@/lib/votes/ballot'
import { castVoteAction } from './actions'

// The link token is in the address: no indexing, no referrer, no caching (also set in next.config headers).
export const metadata: Metadata = { title: `${VOTES.label} vote`, robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string; fixtureId: string }>; searchParams: Promise<{ saved?: string; e?: string }> }

const FLASH: Record<string, string> = { ...BALLOT_MESSAGES, locked: LOCKED_MESSAGE, closed: 'Your vote is in and can no longer be changed.', unavailable: 'This vote is not available any more.' }

/**
 * The ballot page. Identity is settled before any game is looked up, and every failure (wrong link, no cookie, votes off, unknown or
 * closed game, a game this player was not in) is the same plain not-found, so the address reveals nothing about which games exist.
 */
export default async function VotePage({ params, searchParams }: Props) {
  const { token, fixtureId } = await params
  const sp = await searchParams
  const payload = await getPayloadClient()
  const view = await loadVoteView(payload, { token, cookie: (await cookies()).get(availCookieName())?.value, fixtureId })
  if (!view) notFound()
  const { locale } = await getClub()
  const first = view.player.name.split(/\s+/)[0]
  const when = formatMatchDay(view.fixture.localDate, locale)
  const flash = sp.e ? FLASH[sp.e as BallotError] ?? BALLOT_MESSAGES.bad_input : null
  const names = new Map(view.options.map((o) => [o.id, o.name]))
  return (
    <main className="container-site max-w-xl py-8 sm:py-12">
      <p className="text-sm text-brand-grey">{view.fixture.gradeName}{view.fixture.roundName ? `, ${view.fixture.roundName}` : ''}</p>
      <h1 className="display text-3xl text-brand-black">{VOTES.label}: {view.fixture.gradeName} v {view.fixture.opponentName}</h1>
      <p className="mt-1 text-sm text-brand-grey">{when}. Hi {first}.</p>
      {flash && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{flash}</p>}
      {sp.saved && !flash && <p role="status" className="mt-4 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">Your vote is in.{view.canEdit ? ' You can change it for a little while.' : ''}</p>}
      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-brand-black/10">
        {view.canEdit ? (
          <>
            <p className="mb-4 text-sm leading-relaxed text-brand-grey">
              Choose who you think played best. {view.values.length > 1 ? `Your top pick gets ${voteWord(view.values[0])}.` : ''} Only the totals are ever shown, never who voted for whom.
            </p>
            <BallotForm action={castVoteAction} hidden={{ token, fixtureId }} options={view.options} values={view.values} places={view.places} existing={view.existing} submitLabel={view.hasBallot ? 'Change my vote' : 'Send my vote'} />
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-brand-black">Your vote is in</h2>
            <ul className="mt-3 space-y-1 text-sm text-brand-black">
              {view.existing.map((p) => (
                <li key={p.place}>{voteWord(view.values[p.place - 1])}: {names.get(p.playerId) ?? 'A player'}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-brand-grey">It can no longer be changed.</p>
          </>
        )}
      </div>
      <p className="mt-6"><Link href={availabilityPath(token)} className={btnQuiet}>Back to my games</Link></p>
    </main>
  )
}
