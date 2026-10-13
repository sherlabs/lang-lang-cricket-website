import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { TeamBuilder } from '@/components/selector/team-builder'
import { TeamShare } from '@/components/selector/team-share'
import { selectorPaths } from '@/config/site'
import { getPayloadClient } from '@/lib/payload/client'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { getSelectionSettings } from '@/lib/selection/store'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { ScoutLink } from '@/components/selector/scout-link'
import { resolveOpponents } from '@/lib/selector-scouting-queries'
import { loadBuilder } from '@/lib/selector-team-queries'
import { postTextFor } from '@/lib/teams-queries'

export const metadata: Metadata = { title: 'Pick the team', robots: { index: false, follow: false } }

type Props = { params: Promise<{ gameId: string }> }

/** The builder for one game, and (once published) the share material below it. */
export default async function BuilderPage({ params }: Props) {
  const { gameId } = await params
  const user = await requireSelection(selectorPaths.team(gameId))
  const { locale } = await getClub()
  const builder = await loadBuilder(user, gameId)
  if (!builder) notFound()
  const f = builder.view.fixture
  const settings = await getSelectionSettings(await getPayloadClient())
  const scout = (await resolveOpponents(user, [f.opponentName]))[f.opponentName]
  const postText = builder.published ? await postTextFor(builder.published) : null
  return (
    <main className="container-site max-w-2xl py-6 sm:py-10">
      <p><Link href={`${selectorPaths.teams}?weekend=${builder.weekendKey}`} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">All teams</Link></p>
      <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-brand-grey">{f.gradeName}{f.roundName ? ` · ${f.roundName}` : ''}</p>
      <h1 className="display text-3xl text-brand-black">v {f.opponentName}</h1>
      <p className="mt-1 text-brand-grey">{[formatMatchDay(f.localDate, locale), formatMatchTime(f.localTime), [f.venueName, f.venueSuburb].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4">
        <Link href={selectorPaths.suggestFor(gameId)} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-black underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-black">Suggest an XI</Link>
        <ScoutLink resolved={scout} name={f.opponentName} showNone />
      </div>
      <div className="mt-4">
        <TeamBuilder builder={builder} gameId={gameId} announceDefault={settings.announceOnPublish} />
      </div>
      {builder.published && postText && <TeamShare gameId={gameId} postText={postText} publishedAt={builder.published.publishedAt} />}
    </main>
  )
}
