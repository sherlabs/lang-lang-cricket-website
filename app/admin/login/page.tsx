'use client'

import Image from 'next/image'
import { useFormState, useFormStatus } from 'react-dom'
import { login } from './actions'
import { Field, TextInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="xl" variant="brand" disabled={pending} className="w-full">
      {pending ? 'Signing in…' : 'Sign in'}
    </Button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, undefined)
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-black px-5 py-12">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gold/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl bg-white p-8 shadow-card-hover ring-1 ring-white/10">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white p-1 ring-1 ring-brand-black/10">
            <Image src="/assets/branding/logo.png" alt="Lang Lang Cricket Club crest" width={48} height={60} className="h-12 w-auto" priority />
          </span>
          <div className="leading-none">
            <p className="eyebrow">Lang Lang CC</p>
            <h1 className="display mt-2 text-3xl text-brand-black">Admin sign-in</h1>
          </div>
        </div>

        <form action={formAction} className="mt-8 flex flex-col gap-4">
          <Field label="Password" htmlFor="password">
            <TextInput
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              autoFocus
              required
              aria-invalid={state?.error ? true : undefined}
              aria-describedby={state?.error ? 'password-error' : undefined}
            />
          </Field>
          {state?.error && (
            <p id="password-error" role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          )}
          <SubmitButton />
        </form>

        <a href="/" className="mt-6 flex min-h-11 items-center justify-center text-sm text-brand-grey hover:text-brand-black hover:underline">
          Back to the public site
        </a>
      </div>
    </main>
  )
}
