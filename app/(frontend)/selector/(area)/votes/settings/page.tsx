import type { Metadata } from 'next'
import Link from 'next/link'
import { VoteSettingsForm } from '@/components/votes/selector-forms'
import { VOTES, votePaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import { loadVoteSettingsView } from '@/lib/selector-votes-queries'
import { saveVoteSettingsAction } from '../../../votes-actions'

export const metadata: Metadata = { title: `${VOTES.label} vote settings`, robots: { index: false, follow: false } }

/** Vote options in plain English. The committee (admin or editor) can change them here; selectors can read them. */
export default async function VoteSettingsPage() {
  const user = await requireSelection(votePaths.settings)
  const v = await loadVoteSettingsView(user)
  const s = v.settings
  return (
    <main className="container-site max-w-xl py-6 sm:py-10">
      <p><Link href={votePaths.selector} className="text-sm underline underline-offset-4">{VOTES.label} votes</Link></p>
      <h1 className="display mt-2 text-3xl text-brand-black">Vote settings</h1>
      {v.pinWarning && (
        <p role="alert" className="mt-4 rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{v.pinWarning}</p>
      )}
      <p className="mt-3 text-sm leading-relaxed text-brand-grey">
        Players vote from the same link and PIN they use for availability. Votes are anonymous at normal club sizes, but this is not guaranteed for small groups: a game needs a minimum number of votes before it counts.
        {v.averageVoters > 0 ? ` Recent games had about ${v.averageVoters} players each, so ${v.suggestedMinimum} is a sensible minimum.` : ''}
      </p>
      <div className="mt-6">
        <VoteSettingsForm
          action={saveVoteSettingsAction}
          canEdit={v.canEdit}
          hasWarning={Boolean(v.pinWarning)}
          s={{ enabled: s.enabled, allowSelfVote: s.allowSelfVote, ballotValues: s.ballotValues.join(','), tieBreakFewestGames: s.tieBreakFewestGames, voteWindowDays: s.voteWindowDays, editWindowHours: s.editWindowHours, minBallotsToCount: s.minBallotsToCount, publicLeaderboard: s.publicLeaderboard, publicScope: s.publicScope, publicShowBreakdown: s.publicShowBreakdown }}
        />
      </div>
    </main>
  )
}
