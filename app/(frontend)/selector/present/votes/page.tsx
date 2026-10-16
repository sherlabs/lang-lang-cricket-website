import type { Metadata } from 'next'
import Link from 'next/link'
import { Presenter } from '@/components/votes/presenter'
import { VOTES, votePaths } from '@/config/site'
import { getClub } from '@/lib/club'
import { requireSelection } from '@/lib/selector-auth'
import { loadPresentSnapshot } from '@/lib/selector-votes-queries'

export const metadata: Metadata = { title: `${VOTES.label} awards`, robots: { index: false, follow: false } }

type Props = { searchParams: Promise<{ scope?: string; season?: string }> }

/**
 * Awards-night mode. Outside the selector tab bar (a projector needs the whole screen) but still behind the selector login. The page
 * holds public-eligible totals only (closed rounds, cumulative), never ballots or per-game points.
 */
export default async function PresentVotes({ searchParams }: Props) {
  const sp = await searchParams
  const user = await requireSelection(votePaths.present)
  const { locale, shortName } = await getClub()
  const season = typeof sp.season === 'string' && /^\d{4}$/.test(sp.season) ? Number(sp.season) : null
  const gradeId = typeof sp.scope === 'string' && sp.scope !== 'club' && sp.scope.length <= 120 ? sp.scope : null
  const { snapshot, enabled } = await loadPresentSnapshot(user, { season, gradeId, locale, title: `${shortName} ${VOTES.label.toLowerCase()} awards` })
  if (!enabled) {
    return (
      <main className="container-site max-w-xl py-10">
        <p className="rounded-xl bg-white p-5 text-brand-black ring-1 ring-brand-black/10">Voting is switched off, so there is nothing to present. <Link href={votePaths.selector} className="underline underline-offset-4">Back to votes</Link></p>
      </main>
    )
  }
  return <Presenter snapshot={snapshot} storageKey={`present-votes:${season ?? 'now'}:${gradeId ?? 'club'}`} />
}
