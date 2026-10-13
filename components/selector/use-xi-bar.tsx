'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { selectorPaths } from '@/config/site'
import { applySuggestedXiAction } from '@/app/(frontend)/selector/suggest-actions'
import { btnPrimary } from './styles'

/** The sticky "Use this XI" bar. It saves a draft only: publishing stays on the team builder. */
export function UseXiBar({ gameId, revision, playerIds, size, keeperId, captainId, hasSaved, published, blocked }: { gameId: string; revision: number; playerIds: number[]; size: number; keeperId: number | null; captainId: number | null; hasSaved: boolean; published: boolean; blocked: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<{ text: string; stale?: boolean } | null>(null)
  const [sure, setSure] = useState(false)
  const oversize = size > 0 && playerIds.length > size
  const run = () =>
    start(async () => {
      const res = await applySuggestedXiAction({ gameId, expectedRevision: revision, playerIds, keeperId, captainId })
      if (!res.ok) {
        setSure(false)
        return setError({ text: res.error, stale: res.stale })
      }
      router.push(selectorPaths.team(gameId))
    })
  const onClick = () => {
    setError(null)
    if (hasSaved && !sure) return setSure(true)
    run()
  }
  return (
    <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-6 border-t border-brand-black/10 bg-white/95 px-4 py-3 backdrop-blur sm:bottom-0">
      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-status-bad-soft px-3 py-2 text-sm text-status-bad-ink ring-1 ring-status-bad/25">
          {error.text}{' '}
          {error.stale && <button type="button" className="font-semibold underline" onClick={() => router.refresh()}>Reload</button>}
        </p>
      )}
      {sure && <p role="status" className="mb-2 text-sm font-semibold text-brand-black">This replaces the saved draft team. Press again to confirm.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onClick} disabled={pending || oversize || playerIds.length === 0} aria-describedby="use-xi-note" className={btnPrimary}>{pending ? 'Saving…' : sure ? 'Yes, replace the draft' : 'Use this XI'}</button>
        <p id="use-xi-note" className="min-w-0 flex-1 text-xs text-brand-grey">
          Saves as a draft you can still edit. Nothing is published{published ? '; the team already on the public site stays as it is until you publish again' : ''}.
          {oversize && <span className="block font-semibold text-status-bad-ink">Too many players for a team of {size}. Un-pin some before using this XI.</span>}
          {blocked && !oversize && <span className="block font-semibold text-brand-gold-deep">{blocked}</span>}
        </p>
      </div>
    </div>
  )
}
