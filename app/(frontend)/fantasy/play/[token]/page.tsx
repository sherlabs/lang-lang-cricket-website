import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { JoinForm } from '@/components/fantasy/join-form'
import { AuthCard } from '@/components/selector/auth-card'
import { fantasyPaths } from '@/config/site'
import { fantasyCookieName } from '@/lib/fantasy/link'
import { rememberedEntry } from '@/lib/fantasy/join'
import { resolveFantasyLink } from '@/lib/fantasy/store'
import { getPayloadClient } from '@/lib/payload/client'
import { joinAction } from '../../actions'

// The token is in the address: keep it out of referrers and search results (also set in next.config headers: no-store, no-referrer).
export const metadata: Metadata = { title: 'Join the fantasy game', robots: { index: false, follow: false }, referrer: 'no-referrer' }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string }> }

export default async function FantasyPlayPage({ params }: Props) {
  const { token } = await params
  const payload = await getPayloadClient()
  // A wrong, rotated or switched-off link is a plain 404: nothing tells them apart.
  const live = await resolveFantasyLink(payload, token)
  if (!live) notFound()
  const raw = (await cookies()).get(fantasyCookieName())?.value
  if (raw && (await rememberedEntry(payload, raw, live.season, live.settings.linkVersion))) redirect(fantasyPaths.team)
  return (
    <AuthCard title={live.settings.competitionName} intro={`Pick a squad of ${live.season.rules.squadSize} players within the salary cap and score points from real club games. It is free, there are no prizes to pay for and no accounts: a team name and a PIN is all you need.`}>
      <JoinForm action={joinAction} token={token} />
    </AuthCard>
  )
}
