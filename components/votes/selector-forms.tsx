'use client'

import { useActionState } from 'react'
import { btnPrimary, field } from '@/components/selector/styles'
import type { FormState } from '@/lib/selector-form-state'
import { voteWord } from '@/lib/votes/ballot'

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.error}</p>
  if (state.ok) return <p role="status" className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{state.ok}</p>
  return null
}

/** A selector enters a ballot on someone's behalf. Starts empty every time; saving replaces the selector's earlier entry without showing it. */
export function SelectorBallotForm({ action, fixtureId, options, values, places, replaces }: { action: Action; fixtureId: number; options: readonly { id: number; name: string }[]; values: readonly number[]; places: number; replaces: boolean }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="fixtureId" value={fixtureId} />
      {Array.from({ length: places }, (_, i) => i + 1).map((place) => (
        <label key={place} className="block text-sm font-medium text-brand-black" htmlFor={`sel_place_${place}`}>
          {voteWord(values[place - 1])}
          <select id={`sel_place_${place}`} name={`place_${place}`} required defaultValue="" className={`${field} mt-1`}>
            <option value="">Choose a player</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      ))}
      {replaces && <p className="text-xs text-brand-grey">You have already entered a ballot for this game. Saving replaces it. Its picks are not shown.</p>}
      <Message state={state} />
      <button type="submit" className={`${btnPrimary} w-full`} disabled={pending}>{pending ? 'Saving...' : replaces ? 'Replace my entry' : 'Save ballot'}</button>
    </form>
  )
}

const check = 'h-5 w-5 shrink-0'
const row = 'flex min-h-11 items-start gap-3 text-sm text-brand-black'

export function VoteSettingsForm({ action, s, canEdit, hasWarning }: { action: Action; s: { enabled: boolean; allowSelfVote: boolean; ballotValues: string; tieBreakFewestGames: boolean; voteWindowDays: number; editWindowHours: number; minBallotsToCount: number; publicLeaderboard: boolean; publicScope: string; publicShowBreakdown: boolean }; canEdit: boolean; hasWarning: boolean }) {
  const [state, run, pending] = useActionState(action, {})
  const dis = !canEdit
  return (
    <form action={run} className="space-y-5">
      <fieldset disabled={dis} className="space-y-5">
        <label className={row}><input type="checkbox" name="enabled" defaultChecked={s.enabled} className={check} /><span><b>Voting is switched on</b><span className="block text-xs text-brand-grey">Off hides every vote screen.{hasWarning ? ' Read the PIN warning above before you switch it on.' : ''}</span></span></label>
        <label className="block text-sm font-medium text-brand-black">Points for 1st, 2nd, 3rd...
          <input name="ballotValues" defaultValue={s.ballotValues} className={`${field} mt-1`} inputMode="text" pattern="[0-9, \-]+" title="Whole numbers from highest to lowest, for example 3,2,1 or 3-2-1" required />
          <span className="mt-1 block text-xs font-normal text-brand-grey">Highest to lowest, at most 5, for example 3,2,1. Changing this changes every total, including past games.</span>
        </label>
        <label className="block text-sm font-medium text-brand-black">Days voting stays open after a game
          <input name="voteWindowDays" type="number" min={1} max={60} defaultValue={s.voteWindowDays} className={`${field} mt-1`} required />
        </label>
        <label className="block text-sm font-medium text-brand-black">Hours a player can change their vote
          <input name="editWindowHours" type="number" min={0} max={336} defaultValue={s.editWindowHours} className={`${field} mt-1`} required />
        </label>
        <label className="block text-sm font-medium text-brand-black">Votes needed before a game counts
          <input name="minBallotsToCount" type="number" min={3} max={100} defaultValue={s.minBallotsToCount} className={`${field} mt-1`} required />
          <span className="mt-1 block text-xs font-normal text-brand-grey">A game with fewer votes counts nowhere. A small number lowers the protection against working out who voted for whom.</span>
        </label>
        <label className={row}><input type="checkbox" name="allowSelfVote" defaultChecked={s.allowSelfVote} className={check} /><span>Players may vote for themselves</span></label>
        <label className={row}><input type="checkbox" name="tieBreakFewestGames" defaultChecked={s.tieBreakFewestGames} className={check} /><span>On equal points, fewer games ranks higher<span className="block text-xs text-brand-grey">Ties are first split by the most top votes. This also rewards players who played less, so it is off by default.</span></span></label>
        <fieldset className="space-y-3 rounded-xl border border-brand-black/15 p-4">
          <legend className="px-1 text-sm font-bold text-brand-black">Public leaderboard</legend>
          <label className={row}><input type="checkbox" name="publicLeaderboard" defaultChecked={s.publicLeaderboard} className={check} /><span>Show a public leaderboard on the site<span className="block text-xs text-brand-grey">Season totals of games whose voting has closed. Never who voted for whom or how one game went.</span></span></label>
          <label className="block text-sm font-medium text-brand-black">Covers
            <select name="publicScope" defaultValue={s.publicScope} className={`${field} mt-1`}>
              <option value="club">Whole club</option>
              <option value="grade">Each grade</option>
              <option value="both">Both</option>
            </select>
          </label>
          <label className={row}><input type="checkbox" name="publicShowBreakdown" defaultChecked={s.publicShowBreakdown} className={check} /><span>Show the columns for each place (for example the 3s, 2s and 1s)</span></label>
        </fieldset>
      </fieldset>
      <Message state={state} />
      {canEdit ? <button type="submit" className={`${btnPrimary} w-full`} disabled={pending}>{pending ? 'Saving...' : 'Save settings'}</button> : <p className="text-sm text-brand-grey">Only the committee (admins and editors) can change these settings.</p>}
    </form>
  )
}
