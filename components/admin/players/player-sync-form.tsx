'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { RefreshIcon } from '@hugeicons/core-free-icons'
import { runPlayerSync, type SyncState } from '@/app/admin/(shell)/players/actions'
import { Button } from '@/components/ui/button'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="xl" variant="brand" disabled={pending}>
      <HugeiconsIcon icon={RefreshIcon} className={pending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
      {pending ? 'Syncing… (can take a minute)' : 'Sync from PlayHQ'}
    </Button>
  )
}

function statusText(result: SyncState['result']): { tone: 'ok' | 'error'; text: string } | null {
  if (!result) return null
  if (result.status === 'ok') {
    return { tone: 'ok', text: `Synced: ${result.playersCreated} new players, ${result.seasonRows} season rows.` }
  }
  if (result.status === 'locked') return { tone: 'ok', text: 'A sync is already running — try again in a few minutes.' }
  return { tone: 'error', text: `Sync failed: ${result.error ?? 'unknown error'}` }
}

export function PlayerSyncForm() {
  const [state, action] = useFormState<SyncState, FormData>(runPlayerSync, { result: null })
  const status = statusText(state.result)
  return (
    <form action={action} className="flex flex-wrap items-center gap-4">
      <SubmitButton />
      <p role="status" className={status?.tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-brand-grey'}>
        {status?.text ?? ''}
      </p>
    </form>
  )
}
