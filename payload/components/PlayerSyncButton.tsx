'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type SyncResult = { status: 'ok' | 'error' | 'locked'; playersCreated: number; seasonRows: number; error?: string }

/** The sync route allows 300 s (`maxDuration`); give up waiting a little after that. */
const TIMEOUT_MS = 310_000

/** "Run sync now" in `PlayerSyncPanel`: POSTs /api/admin/players-sync, toasts the result, refreshes the list. */
export function PlayerSyncButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const run = async () => {
    setPending(true)
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS)
    try {
      const res = await fetch('/api/admin/players-sync', { method: 'POST', credentials: 'include', signal: abort.signal })
      if (res.status === 401) throw new Error('Your session has expired. Log in again.')
      const result = (await res.json().catch(() => null)) as SyncResult | null
      if (!result) throw new Error(`Sync failed (${res.status}).`)
      if (result.status === 'ok') toast.success(`Synced ${result.seasonRows} rows, ${result.playersCreated} new players`)
      else if (result.status === 'locked') toast.info('A sync is already running — try again in a few minutes.')
      else toast.error(`Sync failed: ${result.error ?? 'unknown error'}`)
    } catch (err) {
      toast.error(
        (err as Error).name === 'AbortError'
          ? 'The sync is taking longer than expected; check back in a few minutes.'
          : (err as Error).message || 'Sync failed.',
      )
    } finally {
      clearTimeout(timer)
      setPending(false)
      router.refresh()
    }
  }

  return (
    <Button buttonStyle="primary" disabled={pending} onClick={run} type="button">
      {pending ? (
        <>
          <span className="club-spinner" aria-hidden /> Syncing… (can take a minute)
        </>
      ) : (
        'Run sync now'
      )}
    </Button>
  )
}
