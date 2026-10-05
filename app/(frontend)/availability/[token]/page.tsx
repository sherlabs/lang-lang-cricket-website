import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { AnswerList } from '@/components/availability/answer-list'
import { IdentifyForm } from '@/components/availability/identify-form'
import { AuthCard } from '@/components/selector/auth-card'
import { btnQuiet } from '@/components/selector/styles'
import { availCookieName } from '@/lib/availability-link'
import { playerView, rememberedPlayer, resolveLink } from '@/lib/availability-public'
import { getPayloadClient } from '@/lib/payload/client'
import { forgetAction, identifyAction } from './actions'

// The token is in the address: keep it out of referrers and search results (also set in next.config headers: no-store, no-referrer).
export const metadata: Metadata = { title: 'Your availability', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

export default async function AvailabilityPage({ params }: Props) {
  const { token } = await params
  const payload = await getPayloadClient()
  // A wrong, rotated or switched-off link is a plain 404: nothing tells them apart.
  const settings = await resolveLink(payload, token)
  if (!settings) notFound()
  const player = await rememberedPlayer(payload, (await cookies()).get(availCookieName())?.value, settings)
  const view = player ? await playerView(payload, player.id, settings) : null

  if (!view) {
    return (
      <AuthCard title="Can you play?" intro="Tell the selectors if you are available. Type your name and PIN so we know who you are.">
        <IdentifyForm action={identifyAction} token={token} />
      </AuthCard>
    )
  }
  const first = view.player.name.split(/\s+/)[0]
  return (
    <main className="container-site max-w-xl py-8 sm:py-12">
      <h1 className="display text-3xl text-brand-black">Hi {first}</h1>
      <p className="mt-2 text-sm text-brand-grey">Tell the selectors if you can play. Only you can see your answers here.</p>
      {!view.inSquad ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-sm text-brand-black ring-1 ring-brand-black/10">You are not in a squad yet, so there are no games to answer. Ask a selector to add you.</p>
      ) : view.fixtures.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white p-5 text-sm text-brand-black ring-1 ring-brand-black/10">There are no upcoming games to answer for yet. Check back soon.</p>
      ) : (
        <div className="mt-6"><AnswerList token={token} fixtures={view.fixtures} /></div>
      )}
      <form action={forgetAction} className="mt-8">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={btnQuiet}>Not {first}? Switch player</button>
      </form>
    </main>
  )
}
