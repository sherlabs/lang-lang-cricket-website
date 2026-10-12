'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Batch = { ok: boolean; processed: number; sent: number; remaining: number; status: string; stopped: boolean }

/**
 * The progress bar for an email that is sending. It asks the server for one batch at a time (the server paces the sends) until
 * nothing is left to try, and can be closed at any time: the scheduled run and the "Continue sending" button pick the work up again.
 * Without scripts the page shows the same numbers and the plain button.
 */
export function EmailSendProgress({ endpoint, total, queued }: { endpoint: string; total: number; queued: number }) {
  const router = useRouter()
  const [left, setLeft] = useState(queued)
  const [note, setNote] = useState('Sending. You can leave this page; sending carries on.')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    const run = async () => {
      for (;;) {
        let r: Batch | null = null
        try {
          const res = await fetch(endpoint, { method: 'POST', credentials: 'include' })
          r = (await res.json().catch(() => null)) as Batch | null
          if (!res.ok || !r?.ok) throw new Error('batch failed')
        } catch {
          if (!cancelled) setNote('Sending paused because this page lost touch with the site. Press Continue sending to carry on.')
          return
        }
        if (cancelled) return
        setLeft(r.remaining)
        if (r.status !== 'sending' || r.remaining === 0) {
          router.refresh()
          return
        }
        if (r.stopped) {
          setNote('The mail provider turned us away. Sending will try again later by itself.')
          router.refresh()
          return
        }
        if (r.processed === 0) {
          setNote('The rest are waiting to be tried again shortly. You can leave this page; sending carries on.')
          router.refresh()
          return
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [endpoint, router])

  const done = Math.max(0, total - left)
  return (
    <div>
      <progress max={Math.max(total, 1)} value={done} aria-label="Emails sent so far" style={{ width: '100%', height: '1.25rem' }} />
      <p role="status" aria-live="polite" className="club-muted">
        {done} of {total} done. {note}
      </p>
    </div>
  )
}
