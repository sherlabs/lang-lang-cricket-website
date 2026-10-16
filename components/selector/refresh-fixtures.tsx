'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/selector-form-state'
import { btnQuiet } from './styles'

export function RefreshFixtures({ action }: { action: (prev: FormState) => Promise<FormState> }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={pending} className={btnQuiet}>{pending ? 'Refreshing...' : 'Refresh fixtures'}</button>
      {state.error && <p role="alert" className="text-sm text-status-bad-ink">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-brand-grey">{state.ok}</p>}
    </form>
  )
}
