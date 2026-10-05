'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { publishTeamsAction } from '@/app/(frontend)/selector/team-actions'
import { btn, btnQuiet } from './styles'
import { Sheet } from './ui'

/** "Publish all ready": publishes every team marked Ready for the weekend in one go, after a confirm that names what becomes public. */
export function PublishAll({ gameIds, grades, announceDefault }: { gameIds: string[]; grades: string[]; announceDefault: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [announce, setAnnounce] = useState(announceDefault)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const go = () =>
    start(async () => {
      const res = await publishTeamsAction({ gameIds, announce, acknowledged: false })
      setOpen(false)
      if (res.ok) {
        setMessage({ ok: true, text: `Published ${res.published.length} ${res.published.length === 1 ? 'team' : 'teams'}.` })
        return router.refresh()
      }
      setMessage({ ok: false, text: res.needsAcknowledgement ? 'Some teams have warnings. Open each one and publish it from there after checking them.' : res.error })
    })
  return (
    <div className="mt-4">
      <button type="button" disabled={gameIds.length === 0} onClick={() => setOpen(true)} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal`}>
        Publish all ready{gameIds.length ? ` (${gameIds.length})` : ''}
      </button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-emerald-900' : 'text-red-800'}`}>{message.text}</p>}
      <Sheet open={open} title="Publish all ready" onClose={() => !pending && setOpen(false)}>
        <div className="space-y-4">
          <p className="text-brand-charcoal">This puts the full teams for {grades.join(', ')} on the public teams page and in the shareable pictures.</p>
          <p className="text-sm text-brand-grey">A picture Facebook or anyone else has already copied cannot be recalled if you take a team down later.</p>
          <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="h-5 w-5" />
            Also post a site announcement for this weekend
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={go} disabled={pending} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal`}>{pending ? 'Publishing…' : 'Publish'}</button>
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
