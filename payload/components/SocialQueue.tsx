'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteQueuedPost, markNetworkNotPosted, markNetworkPosted, pauseScheduledPost, retryFailedPost } from '@/lib/social-actions'
import type { QueueRowView } from '@/lib/social/queue-rows'
import { TABS, type Tab } from '@/lib/social/queue-view'

type Props = {
  api: string
  rows: QueueRowView[]
  initialTab: Tab
  heartbeat: { lastChecked: string; warning: string | null; cadence: string | null }
  /** Where Edit goes, without the post id (a function cannot cross from the server page). */
  editBase: string
}

const EMPTY: Record<Tab, string> = {
  attention: 'Nothing needs your attention.',
  scheduled: 'No posts are scheduled.',
  posted: 'Nothing has been posted yet.',
  drafts: 'No drafts.',
}

/**
 * The queue (wave C spec 4.8): Needs attention, Scheduled, Posted, Drafts. Every state is a word plus an icon, the reason a network
 * did not post is plain English, and a post that did not go out always has the by-hand fallback (download the picture, copy the caption).
 */
export function SocialQueue({ api, rows, initialTab, heartbeat, editBase }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [pending, start] = useTransition()
  const [message, setMessage] = useState('')
  const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => r.tab === t.key).length])) as Record<Tab, number>
  const shown = rows.filter((r) => r.tab === tab)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn()
      setMessage(r.ok ? done : (r.error ?? 'Something went wrong.'))
      if (r.ok) toast.success(done)
      else toast.error(r.error ?? 'Something went wrong.')
      router.refresh()
    })

  const postNow = (id: number) =>
    start(async () => {
      try {
        const res = await fetch(`${api}/post-now`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
        setMessage(res.ok ? 'Sent. Check the result below.' : (j.error ?? 'Could not post it now.'))
      } catch {
        setMessage('Could not post it now.')
      }
      router.refresh()
    })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setMessage('Caption copied.')
    } catch {
      setMessage('Could not copy. Select the caption and copy it by hand.')
    }
  }

  return (
    <section aria-labelledby="social-queue" className="club-panel social-queue">
      <h2 id="social-queue" className="club-field__title">Your posts</h2>
      <p className="club-muted" role="status">{heartbeat.lastChecked}{heartbeat.cadence ? `. ${heartbeat.cadence}` : ''}</p>
      {heartbeat.warning && <p role="alert" className="social-queue__warn"><span aria-hidden="true">! </span>{heartbeat.warning}</p>}
      <div role="group" aria-label="Show posts" className="social__tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="social__tab" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label} <span className="club-muted">({counts[t.key]})</span>
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="club-muted">{message}</p>
      {shown.length === 0 && <p className="club-muted">{EMPTY[tab]}</p>}
      <ul className="social-queue__list">
        {shown.map((r) => (
          <li key={r.id} className="social-queue__row">
            <div className="social-queue__head">
              <strong>{r.title}</strong>
              <span className="social-queue__chip" data-tone={r.chip.tone}><span aria-hidden="true">{r.chip.icon}</span> {r.chip.label}</span>
            </div>
            <p className="club-muted">{r.when}</p>
            <ul className="social-queue__targets">
              {r.targets.map((t) => (
                <li key={t.id}>
                  <span>{t.line}</span>
                  <span className="social-queue__tools">
                    {t.canMarkNotPosted && <button type="button" className="social__button" disabled={pending} onClick={() => run(() => markNetworkNotPosted(t.id), 'Noted. You can retry it now.')}>I checked, it did not go out</button>}
                    {t.canMarkPosted && <button type="button" className="social__button" disabled={pending} onClick={() => run(() => markNetworkPosted(t.id), 'Marked as posted.')}>Mark as posted</button>}
                    {t.fallback && (
                      <>
                        <a className="social__button" href={`${api}/post-image?post=${r.id}&size=${t.size}&download=1`} download>Download picture ({t.sizeLabel})</a>
                        <button type="button" className="social__button" onClick={() => copy(t.finalText)}>Copy caption</button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="club-actions">
              {r.canEdit && <a className="social__button" href={`${editBase}${r.id}`}>Edit</a>}
              {r.canPause && <button type="button" className="social__button" disabled={pending} onClick={() => run(() => pauseScheduledPost(r.id), 'Paused. It is a draft again.')}>Pause (back to draft)</button>}
              {r.canPostNow && <button type="button" className="social__button social__button--primary" disabled={pending} onClick={() => postNow(r.id)}>Post now</button>}
              {r.canRetry && <button type="button" className="social__button social__button--primary" disabled={pending} onClick={() => run(() => retryFailedPost(r.id), 'It will be tried again shortly.')}>Retry now</button>}
              {r.canDelete && <button type="button" className="social__button" disabled={pending} onClick={() => { if (window.confirm('Delete this post? This cannot be undone.')) run(() => deleteQueuedPost(r.id), 'Deleted.') }}>Delete</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
