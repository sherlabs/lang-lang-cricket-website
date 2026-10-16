'use client'

import { useActionState, useState } from 'react'
import type { FormState } from '@/lib/selector-form-state'
import { btnPrimary, field } from '@/components/selector/styles'

export function IdentifyForm({ action, token }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; token: string }) {
  const [state, run, pending] = useActionState(action, {})
  const [show, setShow] = useState(false)
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium text-brand-black">
        Your name
        <input className={`${field} mt-1`} name="name" autoComplete="name" required maxLength={80} />
        <span className="mt-1 block text-xs text-brand-grey">Type your name the way the club knows you, for example Jo Smith.</span>
      </label>
      <label className="block text-sm font-medium text-brand-black">
        Your PIN
        <input className={`${field} mt-1`} name="pin" type={show ? 'text' : 'password'} inputMode="text" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} required maxLength={40} />
        <span className="mt-1 block text-xs text-brand-grey">Your PIN is usually the last 4 digits of your mobile number. If that does not work, ask a selector for a one-time code and type it here instead.</span>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
        <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-5 w-5" />
        Show what I type
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">{state.error}</p>}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={pending}>{pending ? 'Checking...' : 'Continue'}</button>
    </form>
  )
}
