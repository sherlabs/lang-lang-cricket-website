'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/selector-form-state'
import { btnPrimary, field } from '@/components/selector/styles'

export function IdentifyForm({ action, token }: { action: (prev: FormState, formData: FormData) => Promise<FormState>; token: string }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium text-brand-black">
        Your name
        <input className={`${field} mt-1`} name="name" autoComplete="name" required maxLength={80} />
        <span className="mt-1 block text-xs text-brand-grey">As it is on PlayHQ, for example Jo Smith.</span>
      </label>
      <label className="block text-sm font-medium text-brand-black">
        Your PIN
        <input className={`${field} mt-1`} name="pin" type="password" autoComplete="off" required maxLength={40} />
        <span className="mt-1 block text-xs text-brand-grey">Ask a selector if you do not know it. A selector may give you a one-time code to type here instead.</span>
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.error}</p>}
      <button type="submit" className={`${btnPrimary} w-full`} disabled={pending}>{pending ? 'Checking...' : 'Continue'}</button>
    </form>
  )
}
