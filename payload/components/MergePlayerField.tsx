'use client'

import { Button, ConfirmationModal, ReactSelect, toast, useConfig, useDocumentInfo, useModal } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type Option = { label: string; value: number }

const MODAL_SLUG = 'merge-player'

/**
 * `players.fields.merge` (ui, spec §9): pick another player and fold this one into it. Seasons,
 * aliases and honours move to the target and this player is deleted (`POST
 * /api/players/:id/merge`), then the editor goes to the target. Hidden on create.
 */
export function MergePlayerField() {
  const { id, title } = useDocumentInfo()
  const { config } = useConfig()
  const { openModal } = useModal()
  const router = useRouter()
  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(Boolean(id))
  const [target, setTarget] = useState<Option | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const qs = new URLSearchParams({
      'where[id][not_equals]': String(id),
      limit: '0',
      'select[displayName]': 'true',
      sort: 'displayName',
      depth: '0',
    })
    fetch(`${api}/players?${qs}`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ docs: { id: number; displayName?: string | null }[] }>) : { docs: [] }))
      .then(({ docs }) => {
        if (!cancelled) setOptions(docs.map((d) => ({ label: d.displayName || `Player ${d.id}`, value: d.id })))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, id])

  if (!id) return null

  const merge = async () => {
    if (!target) return
    try {
      const res = await fetch(`${api}/players/${id}/merge`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: target.value }),
      })
      const body = (await res.json().catch(() => null)) as { ok?: boolean; targetId?: number; errors?: { message: string }[] } | null
      if (!res.ok || !body?.ok) throw new Error(body?.errors?.[0]?.message ?? `Merge failed (${res.status}).`)
      toast.success(`Merged into ${target.label}`)
      router.push(`${config.routes.admin}/collections/players/${body.targetId ?? target.value}`)
    } catch (err) {
      toast.error((err as Error).message || 'Merge failed.')
    }
  }

  return (
    <div className="club-field club-merge-player">
      <h3 className="club-field__title">Merge into another player</h3>
      <p className="club-muted">
        Use this when PlayHQ lists the same person under two names. This player&apos;s seasons, PlayHQ names and honours move to the
        player you pick, and this player is deleted.
      </p>
      <div className="club-merge-player__row">
        <div className="club-merge-player__select">
          <ReactSelect
            isClearable
            isSearchable
            isLoading={loading}
            options={options}
            value={target ?? undefined}
            placeholder="Search players…"
            onChange={(v) => setTarget(Array.isArray(v) ? null : ((v as Option | null) ?? null))}
          />
        </div>
        <Button type="button" buttonStyle="secondary" disabled={!target} onClick={() => openModal(MODAL_SLUG)}>
          Merge…
        </Button>
      </div>
      <ConfirmationModal
        modalSlug={MODAL_SLUG}
        heading="Merge players?"
        body={
          <p>
            <strong>{title || 'This player'}</strong> will be deleted. Their seasons, PlayHQ names and honours move to{' '}
            <strong>{target?.label}</strong>. This can&apos;t be undone.
          </p>
        }
        confirmLabel="Merge"
        confirmingLabel="Merging…"
        onConfirm={merge}
      />
    </div>
  )
}
