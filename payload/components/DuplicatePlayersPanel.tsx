'use client'

import { Button, toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Side = { id: number; name: string; games: number; hidden: boolean; seasons: number }
export type PairView = { key: string; a: Side; b: Side; keepId: number; score: number; reasons: string[] }
type MergeView = { id: number; sourceName: string; targetName: string | null; at: string; undoable: boolean; status: 'applied' | 'undone' }

/**
 * Duplicate players (W2 spec 6.2): ranked pairs that may be the same person, "Merge into ...", "Not the same person", and the
 * recent merges with Undo. The profile with more games is kept by default; "Swap" changes it. A merge of two players who played
 * the same game is refused with the games named, and needs two explicit confirmations.
 */
export function DuplicatePlayersPanel({ api, adminRoute, pairs, merges }: { api: string; adminRoute: string; pairs: PairView[] | null; merges: MergeView[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [keep, setKeep] = useState<Record<string, number>>({})

  const post = async (path: string, body?: unknown) => {
    const res = await fetch(`${api}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
    return { res, json }
  }
  const messageOf = (json: Record<string, unknown> | null, status: number) => (json?.errors as { message: string }[] | undefined)?.[0]?.message ?? `That did not work (${status}).`

  const merge = async (p: PairView) => {
    const targetId = keep[p.key] ?? p.keepId
    const target = targetId === p.a.id ? p.a : p.b
    const source = target === p.a ? p.b : p.a
    if (!window.confirm(`Merge ${source.name} into ${target.name}? Their seasons, honours and links move to ${target.name}. You can undo this afterwards.`)) return
    setBusy(true)
    try {
      let { res, json } = await post(`/players/${source.id}/merge`, { targetId })
      if (res.status === 409 && json?.code === 'same_game') {
        const first = window.confirm(`${messageOf(json, res.status)}\n\nMerge anyway?`)
        const second = first && window.confirm('Are you sure? Only do this if one person really is listed twice in the same game.')
        if (!second) return
        ;({ res, json } = await post(`/players/${source.id}/merge`, { targetId, confirmSameGame: true }))
      }
      if (!res.ok) throw new Error(messageOf(json, res.status))
      toast.success(`${source.name} was merged into ${target.name}.`)
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const dismiss = async (p: PairView) => {
    setBusy(true)
    try {
      const { res, json } = await post('/players/duplicates/dismiss', { a: p.a.id, b: p.b.id })
      if (!res.ok) throw new Error(messageOf(json, res.status))
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const undo = async (m: MergeView) => {
    if (!window.confirm(`Undo the merge of ${m.sourceName}? ${m.sourceName} comes back with their name, honours and links. Their season totals are rebuilt by the next PlayHQ update.`)) return
    setBusy(true)
    try {
      const { res, json } = await post(`/players/merge-log/${m.id}/undo`)
      if (!res.ok) throw new Error(messageOf(json, res.status))
      toast.success((json?.note as string) ?? 'Merge undone.')
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="club-stack">
      <p className="club-muted">Players who may be the same person, most likely first. Two players who played in the same game are never listed. Hidden players are included.</p>
      {pairs === null ? (
        <p className="club-muted">The list could not be worked out just now. Try again in a minute.</p>
      ) : pairs.length === 0 ? (
        <p className="club-attention__none">No likely duplicates. Nothing to do.</p>
      ) : (
        <table className="club-table">
          <thead><tr><th>Players</th><th>Why</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {pairs.map((p) => {
              const targetId = keep[p.key] ?? p.keepId
              const target = targetId === p.a.id ? p.a : p.b
              const source = target === p.a ? p.b : p.a
              const line = (s: Side) => (
                <li key={s.id}><a href={`${adminRoute}/collections/players/${s.id}`}>{s.name}</a> ({s.games} {s.games === 1 ? 'game' : 'games'}{s.hidden ? ', hidden' : ''})</li>
              )
              return (
                <tr key={p.key}>
                  <td><ul>{line(p.a)}{line(p.b)}</ul></td>
                  <td>{p.reasons.join('. ') || 'Similar names'} ({p.score})</td>
                  <td>
                    <div className="club-actions">
                      <Button buttonStyle="primary" size="small" type="button" disabled={busy} onClick={() => merge(p)}>Merge {source.name} into {target.name}</Button>
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => setKeep((k) => ({ ...k, [p.key]: source.id }))}>Swap</Button>
                      <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => dismiss(p)}>Not the same person</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <h3 className="club-field__title">Recent merges</h3>
      {merges.length === 0 ? (
        <p className="club-muted">No merges yet.</p>
      ) : (
        <table className="club-table">
          <thead><tr><th>Merged</th><th>When</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {merges.map((m) => (
              <tr key={m.id}>
                <td>{m.sourceName} into {m.targetName ?? 'a player who has since been merged away'}</td>
                <td>{new Date(m.at).toLocaleString()}</td>
                <td>
                  {m.status === 'undone' ? 'Undone' : m.undoable ? <Button buttonStyle="secondary" size="small" type="button" disabled={busy} onClick={() => undo(m)}>Undo</Button> : 'Cannot be undone (merged again)'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
