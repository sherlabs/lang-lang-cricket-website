'use client'

import { useActionState, useState, useTransition } from 'react'
import { btnPrimary, btnQuiet, field } from '@/components/selector/styles'
import type { FormState } from '@/lib/selector-form-state'

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

/** Change PIN, add another phone (a one-time code) and forget this device. `forced` is the first sign-in after a committee reset: only the PIN change shows. */
export function PinPanel({ changeAction, deviceCode, forget, forced }: { changeAction: Action; deviceCode: () => Promise<FormState>; forget: () => Promise<void>; forced: boolean }) {
  const [state, run, pending] = useActionState(changeAction, {})
  const [code, setCode] = useState<FormState | null>(null)
  const [busy, start] = useTransition()
  return (
    <div className="space-y-4">
      <details open={forced} className="rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
        <summary className="min-h-11 cursor-pointer text-base font-semibold text-brand-black">{forced ? 'Choose a new PIN to continue' : 'Change my PIN'}</summary>
        <form action={run} className="mt-3 space-y-3">
          <label className="block text-sm font-medium text-brand-black">
            {forced ? 'The temporary PIN the committee gave you' : 'Current PIN'}
            <input className={`${field} mt-1`} name="current" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required />
          </label>
          <label className="block text-sm font-medium text-brand-black">
            New 6 digit PIN
            <input className={`${field} mt-1`} name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required />
            <span className="mt-1 block text-xs text-brand-grey">Choose a PIN that is hard to guess. Changing it signs your other phones out.</span>
          </label>
          <label className="block text-sm font-medium text-brand-black">
            Type the new PIN again
            <input className={`${field} mt-1`} name="again" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" required />
          </label>
          {state.error && <p role="alert" className="rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{state.error}</p>}
          {state.ok && <p role="status" className="rounded-lg bg-status-ok-soft px-3 py-2 text-sm text-status-ok-ink">{state.ok}</p>}
          <button type="submit" className={btnPrimary} disabled={pending}>{pending ? 'Saving...' : 'Change PIN'}</button>
        </form>
      </details>
      {!forced && (
        <details className="rounded-xl bg-white p-5 ring-1 ring-brand-black/10">
          <summary className="min-h-11 cursor-pointer text-base font-semibold text-brand-black">Use my team on another phone</summary>
          <p className="mt-3 text-sm text-brand-grey">Make a one-time code, then type it with your team name on the other phone (choose &ldquo;I have a team&rdquo; and tick the one-time code box). It works once, for 10 minutes.</p>
          <button type="button" className={`${btnQuiet} mt-3`} disabled={busy} onClick={() => start(async () => setCode(await deviceCode()))}>{busy ? 'Making a code...' : 'Make a code'}</button>
          {code?.error && <p role="alert" className="mt-3 text-sm text-status-bad-ink">{code.error}</p>}
          {code?.secret && (
            <div className="mt-3" role="status">
              <p className="text-3xl font-bold tracking-widest text-brand-black">{code.secret}</p>
              <p className="mt-1 text-sm text-brand-grey">{code.ok}</p>
            </div>
          )}
        </details>
      )}
      <form action={forget}>
        <button type="submit" className={btnQuiet}>Not me? Forget this phone</button>
      </form>
    </div>
  )
}
