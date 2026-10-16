'use client'

import { startTransition, type FormEvent } from 'react'

/**
 * React 19 resets uncontrolled inputs after a `<form action={fn}>` finishes, so a
 * submit that comes back with a validation error would wipe what the user typed.
 * Submitting through onSubmit + preventDefault keeps the input (spec §10.3).
 */
export function submitKeepingInput(action: (formData: FormData) => unknown) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(event.currentTarget, submitter)
    startTransition(async () => {
      try {
        await action(formData)
      } catch (error) {
        // A server action that redirect()s rejects with NEXT_REDIRECT after the router has
        // already navigated; rethrowing it would only log "Uncaught Error: NEXT_REDIRECT".
        if (!isRedirectError(error)) throw error
      }
    })
  }
}

/** Next's redirect() error carries a `NEXT_REDIRECT;…` digest (not a public export to test against). */
function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')
}
