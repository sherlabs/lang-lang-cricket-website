'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { refreshPlayHQ, type RefreshState } from '@/app/admin/playhq/actions'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-60">
      {pending ? 'Refreshing…' : 'Refresh PlayHQ data'}
    </button>
  )
}

const time = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }).format(new Date(iso))

export function PlayHQRefreshForm() {
  const [state, action] = useFormState<RefreshState, FormData>(refreshPlayHQ, { refreshedAt: null })
  return (
    <form action={action} className="mb-6 flex items-center gap-3">
      <SubmitButton />
      <p role="status" className="text-sm text-gray-600">
        {state.refreshedAt ? `Refreshed at ${time(state.refreshedAt)}` : ''}
      </p>
    </form>
  )
}
