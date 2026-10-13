import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { XiSuggestion } from '@/components/selector/xi-suggestion'
import { selectorPaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { formatMatchDay, formatMatchTime } from '@/lib/selection/lineup-text'
import { requireSelection } from '@/lib/selector-auth'
import { loadSuggestion } from '@/lib/selector-xi-queries'

export const metadata: Metadata = { title: 'Suggest an XI', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ gameId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }

/** A proposed team for one game from the ordered rules; the selector adjusts it with pins and leave-outs, then saves it as a draft. */
export default async function SuggestPage({ params, searchParams }: Props) {
  const { gameId } = await params
  const user = await requireSelection(selectorPaths.suggestFor(gameId))
  const { locale } = await getClub()
  const q = await searchParams
  const view = await loadSuggestion(user, gameId, { pin: q.pin, leave: q.leave, keeper: q.keeper })
  if (!view) notFound()
  const f = view.fixture
  return (
    <main className="container-site max-w-2xl py-6 sm:py-10">
      <p><Link href={selectorPaths.team(gameId)} className="inline-flex min-h-11 items-center font-semibold text-brand-black underline underline-offset-4">Back to the team</Link></p>
      <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-brand-grey">{f.gradeName}{f.roundName ? ` · ${f.roundName}` : ''}</p>
      <h1 className="display text-3xl text-brand-black">Suggested XI v {f.opponentName}</h1>
      <p className="mt-1 text-brand-grey">{[formatMatchDay(f.localDate, locale), formatMatchTime(f.localTime), [f.venueName, f.venueSuburb].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</p>
      <XiSuggestion view={view} gameId={gameId} />
    </main>
  )
}
