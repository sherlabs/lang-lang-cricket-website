'use client'

import { Button, toast, useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { groupByOccurrence, occurrenceLabel, type OccurrenceGroup, type SummaryRsvp } from './rsvpSummary'

function TallyBar({ tally }: { tally: { yes: number; no: number } }) {
  const total = tally.yes + tally.no
  const yesPct = total ? Math.round((tally.yes / total) * 100) : 0
  return (
    <div className="club-tally">
      <div className="club-tally__bar" role="img" aria-label={`${tally.yes} going, ${tally.no} not going`}>
        {total > 0 && <span className="club-tally__yes" style={{ width: `${yesPct}%` }} />}
      </div>
      <p className="club-tally__legend">
        <span>
          <strong>{tally.yes}</strong> going
        </span>
        <span>
          <strong>{tally.no}</strong> can&apos;t make it
        </span>
      </p>
    </div>
  )
}

function RsvpTable({ rows, showMeal, onDelete, busyId }: { rows: SummaryRsvp[]; showMeal: boolean; onDelete: (r: SummaryRsvp) => void; busyId: number | null }) {
  return (
    <table className="club-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          {showMeal && <th>Dinner</th>}
          <th>Note</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="club-table__strong">{r.name}</td>
            <td>{r.email || '—'}</td>
            {showMeal && <td>{r.meal || <span className="club-muted">No dinner</span>}</td>}
            <td>{r.note || '—'}</td>
            <td className="club-table__actions">
              <Button buttonStyle="secondary" size="small" disabled={busyId === r.id} onClick={() => onDelete(r)} type="button">
                {busyId === r.id ? 'Deleting…' : 'Delete'}
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Occurrence({ group, hasMealOptions, onDelete, busyId }: { group: OccurrenceGroup; hasMealOptions: boolean; onDelete: (r: SummaryRsvp) => void; busyId: number | null }) {
  const dinners = group.meals.reduce((n, [, c]) => n + c, 0)
  const showMeal = hasMealOptions || dinners > 0
  return (
    <section className="club-panel">
      <header className="club-panel__header">
        <h4>{occurrenceLabel(group.iso)}</h4>
        <span className="club-muted">{group.tally.yes + group.tally.no} responses</span>
      </header>
      <TallyBar tally={group.tally} />
      {showMeal && (
        <p className="club-muted">
          <strong>Dinners: {dinners}</strong>
          {dinners > 0 && <> ({group.meals.map(([meal, n]) => `${meal} ${n}`).join(' · ')})</>}
          {' · '}No dinner: {group.noDinner}
        </p>
      )}
      <h5 className="club-panel__subhead">Going ({group.going.length})</h5>
      {group.going.length === 0 ? (
        <p className="club-muted">No one has said yes yet.</p>
      ) : (
        <RsvpTable rows={group.going} showMeal={showMeal} onDelete={onDelete} busyId={busyId} />
      )}
      <h5 className="club-panel__subhead">Not going ({group.notGoing.length})</h5>
      {group.notGoing.length === 0 ? (
        <p className="club-muted">No one has said no.</p>
      ) : (
        <RsvpTable rows={group.notGoing} showMeal={false} onDelete={onDelete} busyId={busyId} />
      )}
    </section>
  )
}

/**
 * `events.fields.rsvpSummary` (ui, spec §9): today's admin event page RSVP section. Reads the
 * event's RSVPs over REST (staff session), grouped per occurrence, with a delete per RSVP.
 * Hidden on create.
 */
export function RsvpSummaryField() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const mealRows = useFormFields(([fields]) => fields.mealOptions?.value)
  const hasMealOptions = typeof mealRows === 'number' ? mealRows > 0 : Array.isArray(mealRows) && mealRows.length > 0
  const [rows, setRows] = useState<SummaryRsvp[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const qs = new URLSearchParams({ 'where[event][equals]': String(id), pagination: 'false', depth: '0', sort: 'occurrenceDate' })
    fetch(`${api}/event-rsvps?${qs}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load RSVPs (${res.status}).`)
        return ((await res.json()) as { docs: SummaryRsvp[] }).docs
      })
      .then(
        (docs) => {
          if (cancelled) return
          setRows(docs)
          setError(null)
        },
        (err: Error) => {
          if (!cancelled) setError(err.message)
        },
      )
    return () => {
      cancelled = true
    }
  }, [api, id, version])

  const onDelete = async (r: SummaryRsvp) => {
    if (!window.confirm(`Delete the RSVP from ${r.name}? This can't be undone.`)) return
    setBusyId(r.id)
    try {
      const res = await fetch(`${api}/event-rsvps/${r.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`Delete failed (${res.status}).`)
      toast.success(`Deleted ${r.name}'s RSVP`)
      setVersion((v) => v + 1)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (!id) return null
  const groups = rows ? groupByOccurrence(rows) : []

  return (
    <div className="club-field">
      <h3 className="club-field__title">RSVPs</h3>
      {error && <p className="club-error">{error}</p>}
      {!rows && !error && <p className="club-muted">Loading…</p>}
      {rows && groups.length === 0 && <p className="club-muted">No RSVPs yet.</p>}
      {groups.map((g) => (
        <Occurrence key={g.iso} group={g} hasMealOptions={hasMealOptions} onDelete={onDelete} busyId={busyId} />
      ))}
    </div>
  )
}
