'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/selector-form-state'
import type { ProfileView } from '@/lib/selector-profile-queries'
import { btnPrimary, btnQuiet, field } from './styles'

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

function Msg({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.error}</p>
  if (state.ok) return <p role="status" className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{state.ok}</p>
  return null
}

export function PhoneForm({ action, playerId, phone, display }: { action: Action; playerId: number; phone: string | null; display: string }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="playerId" value={playerId} />
      <label className="block text-sm font-medium text-brand-black">
        Mobile number
        <input className={`${field} mt-1`} name="phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={phone ? display : ''} placeholder="Leave empty for none" />
      </label>
      <p className="text-xs text-brand-grey">Only selectors can see this. It is used to ring the player, and its last four digits are the default PIN.</p>
      <Msg state={state} />
      <button type="submit" className={btnPrimary} disabled={pending}>{pending ? 'Saving...' : 'Save phone'}</button>
    </form>
  )
}

export function PinForm({ action, playerId, profile }: { action: Action; playerId: number; profile: ProfileView }) {
  const [state, run, pending] = useActionState(action, {})
  const status = !profile.hasPin ? 'No PIN yet: add a phone number, or set a PIN below.' : profile.pinSource === 'manual' ? 'A PIN a selector set.' : 'The last four digits of the phone.'
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="playerId" value={playerId} />
      <p className="text-sm text-brand-black">{status}</p>
      {profile.needsManualPin && <p className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">Another player with this name has the same PIN. Give this player their own PIN.</p>}
      <label className="block text-sm font-medium text-brand-black">
        Set a PIN (4 to 6 digits)
        <input className={`${field} mt-1`} name="pin" type="password" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={6} autoComplete="off" />
      </label>
      <Msg state={state} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnPrimary} disabled={pending}>{pending ? 'Saving...' : 'Save PIN'}</button>
        {profile.pinSource === 'manual' && <button type="submit" name="clear" value="1" className={btnQuiet} disabled={pending}>Use the phone&apos;s last four</button>}
      </div>
    </form>
  )
}

export function CodeForm({ action, playerId, active }: { action: Action; playerId: number; active: boolean }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="playerId" value={playerId} />
      <p className="text-sm text-brand-grey">If the player has forgotten their PIN or is locked out, give them a one-time code to type instead. It works once, for 24 hours.{active ? ' One is already waiting; making another replaces it.' : ''}</p>
      <Msg state={state} />
      <button type="submit" className={btnQuiet} disabled={pending}>{pending ? 'Making...' : 'Make a one-time code'}</button>
    </form>
  )
}

export function FieldsForm({ action, playerId, profile }: { action: Action; playerId: number; profile: ProfileView }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-3">
      <input type="hidden" name="playerId" value={playerId} />
      <label className="block text-sm font-medium text-brand-black">
        Role
        <select name="role" defaultValue={profile.role ?? ''} className={`${field} mt-1`}>
          <option value="">Not set (guess from the stats)</option>
          <option value="batter">Batter</option>
          <option value="bowler">Bowler</option>
          <option value="all-rounder">All-rounder</option>
          <option value="keeper">Keeper</option>
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
        <input type="checkbox" name="canKeep" defaultChecked={profile.canKeep} className="size-5" />
        Can keep wicket
      </label>
      <label className="block text-sm font-medium text-brand-black">
        Notes (only selectors see these)
        <textarea name="notes" defaultValue={profile.notes} maxLength={1000} rows={4} className="mt-1 block w-full rounded-lg border border-brand-black/20 bg-white px-3 py-2 text-base text-brand-black focus:border-brand-gold-deep focus:outline-none focus:ring-2 focus:ring-brand-gold/50" />
      </label>
      <Msg state={state} />
      <button type="submit" className={btnPrimary} disabled={pending}>{pending ? 'Saving...' : 'Save'}</button>
    </form>
  )
}
