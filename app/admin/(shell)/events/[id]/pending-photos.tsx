'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { approveEventPhoto, rejectEventPhoto } from '../photo-actions'
import type { EventPhoto } from '@/db/schema'

/** Approve / reject controls for one publicly submitted photo. Reject deletes the photo and its Blob file. */
export function PendingPhotoCard({ photo }: { photo: EventPhoto }) {
  const router = useRouter()
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(kind: 'approve' | 'reject') {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'approve') await approveEventPhoto(photo.id)
      else await rejectEventPhoto(photo.id)
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Try again.')
      setBusy(null)
    }
  }

  return (
    <li className="flex flex-col overflow-hidden rounded-xl bg-brand-stone/60 ring-1 ring-brand-black/5">
      <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block bg-brand-stone">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt={photo.caption || 'Submitted photo'} className="aspect-[4/3] w-full object-cover" />
      </a>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="min-w-0 flex-1 text-sm">
          <p className="truncate font-medium text-brand-black">{photo.submitterName || 'Anonymous'}</p>
          <p className="line-clamp-2 text-brand-grey">{photo.caption || <span className="italic">No caption</span>}</p>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="brand" size="sm" className="min-h-11 flex-1 gap-1.5" disabled={busy != null} onClick={() => run('approve')}>
            <HugeiconsIcon icon={Tick02Icon} className="h-4 w-4" aria-hidden />
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 flex-1 gap-1.5 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={busy != null}
            onClick={() => run('reject')}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" aria-hidden />
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
      </div>
    </li>
  )
}
