'use client'

import { toast } from '@payloadcms/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { deleteQueuedPost, markNetworkNotPosted, markNetworkPosted, pauseScheduledPost, retryFailedPost } from '@/lib/social-actions'
import type { QueueRowView } from '@/lib/social/queue-rows'
import { queueEmptyText, TABS, isTab, type Tab } from '@/lib/social/queue-view'
import { Button, EmptyState, LinkButton, StatusPill, type PillTone } from './ui'
import { useHydrated } from './useHydrated'

type Props = {
  api: string
  rows: QueueRowView[]
  initialTab: Tab
  /** One plain sentence about the scheduler, and a warning when scheduled posts are not going out. */
  heartbeat: { plain: string; warning: string | null; cadence: string | null }
  /** Where Edit goes, without the post id (a function cannot cross from the server page). */
  editBase: string
  makeHref: string
}

const TONE: Record<string, PillTone> = { published: 'ok', failed: 'danger', unknown: 'warn', publishing: 'accent' }
const CHIP_TONE: Record<string, PillTone> = { ok: 'ok', warn: 'warn', info: 'accent', idle: 'neutral' }

/**
 * The Posts tab (wave G WP-2a): Needs attention, Scheduled, Posted, Drafts with counts, a picture and the start of the caption on every
 * row, the networks as pills, the time in club time and every state in plain words. A post that did not go out always has the by-hand
 * fallback (download the picture, copy the caption). With no posts at all it says so and offers the one next step.
 */
export function SocialQueue({ api, rows, initialTab, heartbeat, editBase, makeHref }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [pending, start] = useTransition()
  const hydrated = useHydrated()
  // The tab in the address wins over the server's guess, which can arrive without the query on a hard load. Read after mount only.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('status')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the address bar (an external system) after mount, on purpose
    if (isTab(wanted)) setTab(wanted)
  }, [])
  const [message, setMessage] = useState('')
  const counts = Object.fromEntries(TABS.map((t) => [t.key, rows.filter((r) => r.tab === t.key).length])) as Record<Tab, number>
  const shown = rows.filter((r) => r.tab === tab)

  const pick = (t: Tab) => {
    setTab(t)
    const q = new URLSearchParams(window.location.search)
    q.set('status', t)
    window.history.replaceState(null, '', `${window.location.pathname}?${q}`)
  }

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

  if (rows.length === 0) {
    return (
      <section aria-labelledby="social-queue" className="social-queue">
        <h2 id="social-queue" className="ui-sr-only">Your posts</h2>
        <EmptyState icon="social" action={<LinkButton href={makeHref}>Make a post</LinkButton>}>
          Nothing waiting. Make a post to get started.
        </EmptyState>
        <p className="social-hint">{heartbeat.plain}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="social-queue" className="social-queue">
      <h2 id="social-queue" className="ui-sr-only">Your posts</h2>
      <p className="social-hint" role="status">{heartbeat.plain}{heartbeat.cadence ? ` ${heartbeat.cadence}` : ''}</p>
      {heartbeat.warning && <p role="alert" className="social-warn"><span aria-hidden="true">! </span>{heartbeat.warning}</p>}
      <div role="group" aria-label="Show posts" className="social-seg social-seg--tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`social-seg__item${tab === t.key ? ' is-on' : ''}`} aria-pressed={tab === t.key} disabled={!hydrated} onClick={() => pick(t.key)}>
            {t.label} <span className="social-seg__count">{counts[t.key]}</span>
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="social-status">{message}</p>
      {shown.length === 0 && <EmptyState icon="social" className="social-queue__empty">{queueEmptyText(tab)}</EmptyState>}
      <ul className="social-posts">
        {shown.map((r) => (
          <li key={r.id} className="social-post">
            {/* eslint-disable-next-line @next/next/no-img-element -- a staff-only picture drawn on demand, not a site image */}
            <img className="social-post__thumb" src={`${api}/post-image?post=${r.id}&size=${r.thumbSize}`} alt="" loading="lazy" width={96} height={96} />
            <div className="social-post__main">
              <div className="social-post__head">
                <strong className="social-post__title">{r.title}</strong>
                <StatusPill tone={CHIP_TONE[r.chip.tone] ?? 'neutral'}><span aria-hidden="true">{r.chip.icon}</span> {r.chip.label}</StatusPill>
              </div>
              {r.caption ? <p className="social-post__caption">{r.caption}</p> : null}
              <p className="social-hint">{r.when}</p>
              {r.targets.length > 0 ? (
                <ul className="social-pills" aria-label="Networks">
                  {r.targets.map((t) => <li key={t.id}><StatusPill tone={TONE[t.status] ?? 'neutral'}>{t.label}</StatusPill></li>)}
                </ul>
              ) : null}
              <ul className="social-post__targets">
                {r.targets.map((t) => (
                  <li key={t.id}>
                    <span>{t.line}</span>
                    <span className="social-actions">
                      {t.canMarkNotPosted && <Button variant="secondary" disabled={pending} onClick={() => run(() => markNetworkNotPosted(t.id), 'Noted. You can retry it now.')}>I checked, it did not go out</Button>}
                      {t.canMarkPosted && <Button variant="secondary" disabled={pending} onClick={() => run(() => markNetworkPosted(t.id), 'Marked as posted.')}>Mark as posted</Button>}
                      {t.fallback && (
                        <>
                          <LinkButton variant="secondary" href={`${api}/post-image?post=${r.id}&size=${t.size}&download=1`} download>Download picture ({t.sizeLabel})</LinkButton>
                          <Button variant="secondary" onClick={() => copy(t.finalText)}>Copy caption</Button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="social-actions">
                {r.canEdit && <LinkButton variant="secondary" href={`${editBase}${r.id}`}>Edit</LinkButton>}
                {r.canPause && <Button variant="secondary" disabled={pending} onClick={() => run(() => pauseScheduledPost(r.id), 'Paused. It is a draft again.')}>Pause (back to draft)</Button>}
                {r.canPostNow && <Button disabled={pending} onClick={() => { if (window.confirm(`Post this to ${r.targets.map((t) => t.label).join(', ') || 'the networks'} now? This cannot be undone.`)) postNow(r.id) }}>Post now</Button>}
                {r.canRetry && <Button disabled={pending} onClick={() => run(() => retryFailedPost(r.id), 'Queued to try again. It goes out the next time the scheduler checks, or use Post now.')}>Retry</Button>}
                {r.canDelete && <Button variant="quiet" disabled={pending} onClick={() => { if (window.confirm('Delete this post? This cannot be undone.')) run(() => deleteQueuedPost(r.id), 'Deleted.') }}>Delete</Button>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
