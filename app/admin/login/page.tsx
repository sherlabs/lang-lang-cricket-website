'use client'

import { useFormState } from 'react-dom'
import { login } from './actions'

export default function LoginPage() {
  const [state, formAction] = useFormState(login, undefined)
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Admin login</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          className="rounded border px-3 py-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-white">
          Log in
        </button>
      </form>
    </main>
  )
}
