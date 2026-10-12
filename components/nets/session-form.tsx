'use client'

import { useActionState } from 'react'
import type { FormState } from '@/lib/selector-form-state'
import { btnPrimary, field } from '@/components/selector/styles'

type Action = (prev: FormState, formData: FormData) => Promise<FormState>
export type SessionDefaults = { sessionId?: number; title: string; date: string; startTime: string; nets: number; minutesPerTurn: number; groupSize: number; notes: string }

/** Create or edit a net session. Plain fields, no JavaScript needed to submit. */
export function SessionForm({ action, defaults, submitLabel }: { action: Action; defaults: SessionDefaults; submitLabel: string }) {
  const [state, run, pending] = useActionState(action, {})
  return (
    <form action={run} className="space-y-3">
      {defaults.sessionId != null && <input type="hidden" name="sessionId" value={defaults.sessionId} />}
      <label className="block text-sm font-medium text-brand-black">
        Name
        <input className={`${field} mt-1`} name="title" defaultValue={defaults.title} maxLength={80} autoComplete="off" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-brand-black">
          Date
          <input className={`${field} mt-1`} name="date" type="date" required defaultValue={defaults.date} />
        </label>
        <label className="block text-sm font-medium text-brand-black">
          Start time
          <input className={`${field} mt-1`} name="startTime" type="time" defaultValue={defaults.startTime} />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <label className="block text-sm font-medium text-brand-black">
          Nets
          <input className={`${field} mt-1`} name="nets" type="number" inputMode="numeric" min={1} max={12} defaultValue={defaults.nets} />
        </label>
        <label className="block text-sm font-medium text-brand-black">
          Minutes each
          <input className={`${field} mt-1`} name="minutesPerTurn" type="number" inputMode="numeric" min={1} max={30} defaultValue={defaults.minutesPerTurn} />
        </label>
        <label className="block text-sm font-medium text-brand-black">
          Per net
          <input className={`${field} mt-1`} name="groupSize" type="number" inputMode="numeric" min={2} max={8} defaultValue={defaults.groupSize} />
        </label>
      </div>
      <label className="block text-sm font-medium text-brand-black">
        Notes (optional)
        <textarea name="notes" defaultValue={defaults.notes} maxLength={500} rows={2} className="mt-1 block w-full rounded-lg border border-brand-black/20 bg-white px-3 py-2 text-base text-brand-black focus:border-brand-gold-deep focus:outline-none focus:ring-2 focus:ring-brand-gold/50" />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{state.error}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-brand-gold-pale px-3 py-2 text-sm text-brand-black ring-1 ring-brand-gold/30">{state.ok}</p>}
      <button type="submit" className={btnPrimary} disabled={pending}>{pending ? 'Saving...' : submitLabel}</button>
    </form>
  )
}
