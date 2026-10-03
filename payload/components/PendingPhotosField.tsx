'use client'

/* eslint-disable @next/next/no-img-element */
import { Button, toast, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type PendingPhoto = { id: number; url?: string | null; caption?: string | null; submitterName?: string | null; filename?: string | null }

/**
 * `events.fields.pendingPhotos` (ui, spec §9): photos sent in from the public event page,
 * waiting for review. Approve → `PATCH { status: 'approved' }`; Reject → `DELETE` after a
 * confirm (the storage plugin removes the blob, except for legacy rows, spec §7.5).
 * Renders nothing unless pending photos exist (and nothing on create).
 */
export function PendingPhotosField() {
  const { id } = useDocumentInfo()
  const { config } = useConfig()
  const router = useRouter()
  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const [photos, setPhotos] = useState<PendingPhoto[]>([])
  const [busyId, setBusyId] = useState<number | null>(null)

  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const qs = new URLSearchParams({
      'where[and][0][event][equals]': String(id),
      'where[and][1][status][equals]': 'pending',
      pagination: 'false',
      depth: '0',
      sort: 'createdAt',
    })
    fetch(`${api}/event-photos?${qs}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Could not load pending photos (${res.status}).`)
        return ((await res.json()) as { docs: PendingPhoto[] }).docs
      })
      .then(
        (docs) => {
          if (!cancelled) setPhotos(docs)
        },
        (err: Error) => {
          if (!cancelled) toast.error(err.message)
        },
      )
    return () => {
      cancelled = true
    }
  }, [api, id, version])

  const act = async (photo: PendingPhoto, action: 'approve' | 'reject') => {
    if (action === 'reject' && !window.confirm('Say no to this photo? It will be removed for good.')) return
    setBusyId(photo.id)
    try {
      const res =
        action === 'approve'
          ? await fetch(`${api}/event-photos/${photo.id}`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'approved' }),
            })
          : await fetch(`${api}/event-photos/${photo.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) throw new Error(`${action === 'approve' ? 'Approve' : 'Reject'} failed (${res.status}).`)
      toast.success(action === 'approve' ? 'Photo approved — it is now on the event page' : 'Photo rejected and deleted')
      setVersion((v) => v + 1)
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  if (!id || photos.length === 0) return null

  return (
    <div className="club-field">
      <h3 className="club-field__title">Photos waiting for approval ({photos.length})</h3>
      <p className="club-muted">Sent in from the event page on the website. Approve to put a photo on the page, or say no to remove it.</p>
      <ul className="club-photo-grid">
        {photos.map((p) => (
          <li key={p.id} className="club-photo-card">
            {p.url ? <img src={p.url} alt={p.caption || p.filename || 'Pending photo'} /> : <div className="club-photo-card__empty">No file</div>}
            <div className="club-photo-card__body">
              <p className="club-table__strong">{p.submitterName || 'Anonymous'}</p>
              {p.caption && <p className="club-muted">{p.caption}</p>}
              <div className="club-photo-card__actions">
                <Button buttonStyle="primary" size="small" disabled={busyId === p.id} onClick={() => act(p, 'approve')} type="button">
                  Approve
                </Button>
                <Button buttonStyle="secondary" size="small" disabled={busyId === p.id} onClick={() => act(p, 'reject')} type="button">
                  Say no
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
