'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/lib/selector-form-state'
import { btnPrimary, btnQuiet, field } from '@/components/selector/styles'

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

/** Join with a new team, or return with the team name and PIN (or a one-time code from another phone). One server action, `mode` says which. */
export function JoinForm({ action, token }: { action: Action; token: string }) {
  const [mode, setMode] = useState<'join' | 'return'>('join')
  const [state, run, pending] = useActionState(action, {})
  const [show, setShow] = useState(false)
  const [code, setCode] = useState(false)
  const joining = mode === 'join'
  return (
    <div className="space-y-5">
      <div role="group" aria-label="Join or return" className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={joining} onClick={() => setMode('join')} className={joining ? `${btnPrimary} w-full` : `${btnQuiet} w-full`}>New team</button>
        <button type="button" aria-pressed={!joining} onClick={() => setMode('return')} className={!joining ? `${btnPrimary} w-full` : `${btnQuiet} w-full`}>I have a team</button>
      </div>
      <form action={run} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="mode" value={mode} />
        {joining && (
          <p className="rounded-lg bg-brand-gold/15 px-3 py-2 text-sm text-brand-black">
            <strong>Do not use a surname or a child&rsquo;s name.</strong> The team name can appear on the leaderboard.
          </p>
        )}
        <label className="block text-sm font-medium text-brand-black">
          Team name
          <input className={`${field} mt-1`} name="teamName" autoComplete="off" required minLength={2} maxLength={30} />
          {joining && <span className="mt-1 block text-xs text-brand-grey">2 to 30 characters: letters, numbers, spaces and basic punctuation.</span>}
        </label>
        <label className="block text-sm font-medium text-brand-black">
          {!joining && code ? 'One-time code' : joining ? 'Choose a 6 digit PIN' : 'Your 6 digit PIN'}
          <input className={`${field} mt-1`} name="pin" type={show ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" required maxLength={6} minLength={6} />
          {joining && <span className="mt-1 block text-xs text-brand-grey">Choose a PIN that is hard to guess. You need it to sign in on a new phone.</span>}
        </label>
        {joining && (
          <label className="block text-sm font-medium text-brand-black">
            Type the PIN again
            <input className={`${field} mt-1`} name="again" type={show ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" required maxLength={6} minLength={6} />
          </label>
        )}
        {!joining && (
          <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
            <input type="checkbox" name="kind" value="code" checked={code} onChange={(e) => setCode(e.target.checked)} className="h-5 w-5" />
            This is a one-time code from my other phone
          </label>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-5 w-5" />
          Show what I type
        </label>
        {state.error && <p role="alert" className="rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{state.error}</p>}
        <button type="submit" className={`${btnPrimary} w-full`} disabled={pending}>{pending ? 'Checking...' : joining ? 'Join' : 'Continue'}</button>
      </form>
      <p className="text-xs leading-relaxed text-brand-grey">
        We store your team name and a scrambled copy of your PIN, nothing else. The committee can see team names. The leaderboard shows team names only when the committee makes it public. To be removed, ask the committee.
      </p>
    </div>
  )
}
