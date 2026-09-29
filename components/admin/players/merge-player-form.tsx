'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { mergePlayers } from '@/app/admin/(shell)/players/actions'
import { Field, Select } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

export type MergeOption = { id: number; name: string; yearsHint: string }

/** Folds this player into another one (same person listed under two names in PlayHQ). */
export function MergePlayerForm({ sourceId, sourceName, options }: { sourceId: number; sourceName: string; options: MergeOption[] }) {
  const router = useRouter()
  const [targetId, setTargetId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectId = `merge-${sourceId}-target`

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const target = Number(targetId)
    if (!target || !confirmed) return
    setBusy(true)
    setError(null)
    try {
      await mergePlayers(sourceId, target)
      router.push(`/admin/players/${target}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Could not merge. Try again.')
      setBusy(false)
    }
  }

  if (options.length === 0) return <p className="text-sm text-brand-grey">There are no other players to merge into.</p>

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Merge into" htmlFor={selectId}>
        <Select
          id={selectId}
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value)
            setError(null)
          }}
        >
          <option value="">Choose a player…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.yearsHint ? `${o.name} (${o.yearsHint})` : o.name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-start gap-2 text-sm text-brand-black">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border border-brand-black/25 accent-brand-gold-deep"
        />
        <span>
          I understand {sourceName} will be deleted and their seasons, aliases and honours move to the chosen player.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" variant="danger" size="xl" disabled={!targetId || !confirmed || busy}>
          {busy ? 'Merging…' : 'Merge players'}
        </Button>
      </div>
    </form>
  )
}
