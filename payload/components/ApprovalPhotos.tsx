'use client'

/* eslint-disable @next/next/no-img-element */
import { Button, toast, useConfig } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type PendingPhotoItem = {
  id: number
  url: string | null
  caption: string
  submitterName: string
  eventTitle: string
  eventHref: string | null
}

/** Approve (PATCH status) or reject (DELETE) photos sent in from event pages. Same calls as `PendingPhotosField`. */
export function ApprovalPhotos({ photos }: { photos: PendingPhotoItem[] }) {
  const { config } = useConfig()
  const router = useRouter()
  const api = `${config.serverURL ?? ''}${config.routes.api}`
  const [busyId, setBusyId] = useState<number | null>(null)

  const act = async (photo: PendingPhotoItem, action: 'approve' | 'reject') => {
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
      if (!res.ok) throw new Error('That did not work. Please try again.')
      toast.success(action === 'approve' ? 'Done. The photo is now on the event page.' : 'Done. The photo was removed.')
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ul className="club-photo-grid">
      {photos.map((p) => (
        <li key={p.id} className="club-photo-card">
          {p.url ? <img src={p.url} alt={p.caption || 'Photo waiting for approval'} /> : <div className="club-photo-card__empty">No picture</div>}
          <div className="club-photo-card__body">
            <p className="club-table__strong">{p.eventTitle}</p>
            <p className="club-muted">Sent by {p.submitterName || 'someone'}</p>
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
  )
}
