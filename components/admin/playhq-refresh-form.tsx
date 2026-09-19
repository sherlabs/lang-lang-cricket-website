'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { RefreshIcon } from '@hugeicons/core-free-icons'
import { refreshPlayHQ, type RefreshState } from '@/app/admin/(shell)/playhq/actions'
import { Button } from '@/components/ui/button'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="xl" variant="brand" disabled={pending}>
      <HugeiconsIcon icon={RefreshIcon} className={pending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
      {pending ? 'Refreshing…' : 'Refresh PlayHQ data'}
    </Button>
  )
}

const time = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }).format(new Date(iso))

export function PlayHQRefreshForm() {
  const [state, action] = useFormState<RefreshState, FormData>(refreshPlayHQ, { refreshedAt: null })
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <SubmitButton />
      <p role="status" className="text-sm text-brand-grey">
        {state.refreshedAt ? `Refreshed at ${time(state.refreshedAt)}. Fixtures and results now show the latest PlayHQ data.` : ''}
      </p>
    </form>
  )
}
