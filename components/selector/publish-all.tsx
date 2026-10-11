'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { publishTeamsAction } from '@/app/(frontend)/selector/team-actions'
import { btn, btnQuiet } from './styles'
import { Sheet } from './ui'

/** "Publish all ready": publishes every team marked Ready for the weekend in one go, after a confirm that names what becomes public. */
export function PublishAll({ gameIds, revisions, grades, announceDefault }: { gameIds: string[]; revisions: Record<string, number>; grades: string[]; announceDefault: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [announce, setAnnounce] = useState(announceDefault)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [warnings, setWarnings] = useState<{ gradeName: string; text: string }[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const close = () => {
    setOpen(false)
    setWarnings(null)
    setAcknowledged(false)
  }
  const go = () =>
    start(async () => {
      const res = await publishTeamsAction({ gameIds, announce, acknowledged, expectedRevisions: revisions, requireReady: true })
      if (!res.ok && res.needsAcknowledgement) {
        // Nothing was published: show what is worth a second look and let the selector go ahead knowingly.
        setWarnings(res.needsAcknowledgement)
        return
      }
      close()
      if (res.ok) {
        setMessage({ ok: true, text: `Published ${res.published.length} ${res.published.length === 1 ? 'team' : 'teams'}.` })
        return router.refresh()
      }
      setMessage({ ok: false, text: `${res.error} Nothing was published.` })
    })
  return (
    <div className="mt-4">
      <button type="button" disabled={gameIds.length === 0} onClick={() => setOpen(true)} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal`}>
        Publish all ready{gameIds.length ? ` (${gameIds.length})` : ''}
      </button>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-emerald-900' : 'text-red-800'}`}>{message.text}</p>}
      <Sheet open={open} title="Publish all ready" onClose={() => !pending && close()}>
        <div className="space-y-4">
          <p className="text-brand-charcoal">This puts the full teams for {grades.join(', ')} on the public teams page and in the shareable pictures.</p>
          <p className="text-sm text-brand-grey">A picture Facebook or anyone else has already copied cannot be recalled if you take a team down later.</p>
          <label className="flex min-h-11 items-center gap-3 text-sm text-brand-black">
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="h-5 w-5" />
            Also post a site announcement for this weekend
          </label>
          {warnings && (
            <div className="rounded-lg bg-brand-gold-pale p-3 ring-1 ring-brand-gold/30">
              <p className="text-sm font-bold text-brand-black">Nothing has been published yet. Worth a look first:</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-brand-black">{warnings.map((w, i) => <li key={i}><span className="font-semibold">{w.gradeName}:</span> {w.text}</li>)}</ul>
              <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-brand-black">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="h-5 w-5" />
                Publish anyway
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={go} disabled={pending || (warnings != null && !acknowledged)} className={`${btn} bg-brand-black text-brand-gold hover:bg-brand-charcoal`}>{pending ? 'Publishing…' : warnings ? 'Publish anyway' : 'Publish'}</button>
            <button type="button" onClick={close} disabled={pending} className={btnQuiet}>Cancel</button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
