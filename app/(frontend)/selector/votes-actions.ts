'use server'

import { redirect } from 'next/navigation'
import { VOTES, votePaths } from '@/config/site'
import { requireSelection } from '@/lib/selector-auth'
import { deleteBallot, enterSelectorBallot, saveVoteSettings, setGameVotes } from '@/lib/selector-votes-queries'
import type { FormState } from '@/lib/selector-form-state'
import { picksFromForm } from '@/lib/votes/ballot'

/**
 * Server actions for best-player votes in the selector area. Each is a public POST, so each calls `requireSelection()` first and
 * hands the verified user to `lib/selector-votes-queries.ts`, which re-checks the role (settings: admin or editor, delete: admin) and
 * derives who did it from that user. The form's fields only say WHICH game and WHAT value.
 */
const asInt = (v: unknown): number | null => (typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : null)
const WRONG = 'Something went wrong. Please try again.'

export async function enterBallotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(votePaths.selector)
  const fixtureId = asInt(formData.get('fixtureId'))
  if (fixtureId == null) return { error: WRONG }
  const res = await enterSelectorBallot(user, fixtureId, picksFromForm((k) => formData.get(k), VOTES.maxPlaces))
  return res.ok ? { ok: 'Ballot saved. It is counted as "entered by a selector" and its picks are not shown here.' } : { error: res.error }
}

export async function setGameStateAction(formData: FormData): Promise<void> {
  const user = await requireSelection(votePaths.selector)
  const fixtureId = asInt(formData.get('fixtureId'))
  if (fixtureId == null) redirect(votePaths.selector)
  const patch: { votesState?: unknown; countsForAwards?: unknown } = {}
  if (formData.has('votesState')) patch.votesState = formData.get('votesState')
  if (formData.has('countsForAwards')) patch.countsForAwards = formData.get('countsForAwards') === 'true'
  await setGameVotes(user, fixtureId, patch)
  redirect(votePaths.fixture(fixtureId))
}

export async function saveVoteSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(votePaths.settings)
  const get = (k: string) => formData.get(k)
  const res = await saveVoteSettings(user, {
    enabled: get('enabled') === 'on',
    allowSelfVote: get('allowSelfVote') === 'on',
    ballotValues: get('ballotValues'),
    tieBreakFewestGames: get('tieBreakFewestGames') === 'on',
    voteWindowDays: get('voteWindowDays'),
    editWindowHours: get('editWindowHours'),
    minBallotsToCount: get('minBallotsToCount'),
    publicLeaderboard: get('publicLeaderboard') === 'on',
    publicScope: get('publicScope'),
    publicShowBreakdown: get('publicShowBreakdown') === 'on',
  })
  if (!res.ok) return { error: res.error }
  return { ok: res.warning ? `Saved. ${res.warning}` : 'Saved.' }
}

export async function deleteBallotAction(formData: FormData): Promise<void> {
  const user = await requireSelection(votePaths.selector)
  const fixtureId = asInt(formData.get('fixtureId'))
  // `ballot` is the audit list's key (`player:<id>` or `selector:<userId>`); the older `playerId` field still works.
  const ballot = formData.get('ballot')
  const playerId = asInt(formData.get('playerId'))
  const which = typeof ballot === 'string' && /^(player|selector):\d{1,9}$/.test(ballot) ? ballot : playerId
  if (fixtureId == null || which == null) redirect(votePaths.selector)
  await deleteBallot(user, fixtureId, which)
  redirect(votePaths.fixture(fixtureId))
}
