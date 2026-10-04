'use client'

import { Button, toast } from '@payloadcms/ui'
import { useState } from 'react'

/** POSTs /api/admin/playhq-refresh (spec §9); disabled while pending. */
export function PlayHQRefreshButton() {
  const [pending, setPending] = useState(false)

  const refresh = async () => {
    setPending(true)
    try {
      const res = await fetch('/api/admin/playhq-refresh', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error(res.status === 401 ? 'Your session has expired. Log in again.' : `Refresh failed (${res.status}).`)
      toast.success('Fixtures and ladder will refetch on next view')
    } catch (err) {
      toast.error((err as Error).message || 'Refresh failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button buttonStyle="primary" disabled={pending} onClick={refresh} type="button">
      {pending ? 'Refreshing…' : 'Refresh PlayHQ data'}
    </Button>
  )
}
