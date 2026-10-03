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
      await action(formData)
    })
  }
}
