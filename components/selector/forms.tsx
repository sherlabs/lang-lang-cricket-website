'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/selector-form-state'

const input = 'mt-1 block h-12 w-full rounded-lg border border-brand-black/20 bg-white px-3 text-base text-brand-black focus:border-brand-gold-deep focus:outline-none focus:ring-2 focus:ring-brand-gold/50'
const submit = 'flex min-h-12 w-full items-center justify-center rounded-lg bg-brand-gold px-4 text-base font-semibold text-brand-black transition hover:bg-brand-gold-light disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-black'

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.error}</p>
  if (state.ok) return <p role="status" className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{state.ok}</p>
  return null
}

type Action = (prev: FormState, formData: FormData) => Promise<FormState>

export function LoginForm({ action, next }: { action: Action; next: string }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium text-brand-black">
        Email
        <input className={input} type="email" name="email" autoComplete="username" inputMode="email" required />
      </label>
      <label className="block text-sm font-medium text-brand-black">
        Password
        <input className={input} type="password" name="password" autoComplete="current-password" required />
      </label>
      <Message state={state} />
      <button className={submit} type="submit" disabled={pending}>{pending ? 'Signing in...' : 'Sign in'}</button>
    </form>
  )
}

export function ChoosePasswordForm({ action, token }: { action: Action; token: string }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <label className="block text-sm font-medium text-brand-black">
        Choose a password
        <input className={input} type="password" name="password" autoComplete="new-password" minLength={10} required />
        <span className="mt-1 block text-xs text-brand-grey">At least 10 characters.</span>
      </label>
      <label className="block text-sm font-medium text-brand-black">
        Type it again
        <input className={input} type="password" name="confirm" autoComplete="new-password" minLength={10} required />
      </label>
      <Message state={state} />
      <button className={submit} type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save password and continue'}</button>
    </form>
  )
}

/** `hasPassword` false: a Facebook-invited selector choosing their first password, so no current password is asked for. */
export function ChangePasswordForm({ action, hasPassword = true }: { action: Action; hasPassword?: boolean }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-4">
      {hasPassword && (
        <label className="block text-sm font-medium text-brand-black">
          Current password
          <input className={input} type="password" name="current" autoComplete="current-password" required />
        </label>
      )}
      <label className="block text-sm font-medium text-brand-black">
        {hasPassword ? 'New password' : 'Choose a password'}
        <input className={input} type="password" name="password" autoComplete="new-password" minLength={10} required />
      </label>
      <label className="block text-sm font-medium text-brand-black">
        New password again
        <input className={input} type="password" name="confirm" autoComplete="new-password" minLength={10} required />
      </label>
      <Message state={state} />
      <button className={submit} type="submit" disabled={pending}>{pending ? 'Saving...' : hasPassword ? 'Change password' : 'Save password'}</button>
    </form>
  )
}
