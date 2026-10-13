'use client'

import { toast } from '@payloadcms/ui'
import { useState } from 'react'
import { saveCaptionSettings, saveDraft, schedulePost } from '@/lib/social-actions'
import type { Network } from '@/lib/social/adapters/types'
import { templatesToSave } from '@/lib/social/caption'
import { composeFinalText, networkLength, validateCaption } from '@/lib/social/final-text'
import { scheduleBlockers } from '@/lib/social/post-spec'
import { checkScheduleTime, insideWindow, quietHoursText, type PublishWindow } from '@/lib/social/schedule-time'
import { NOT_AVAILABLE } from '@/lib/social/queue-view'
import { SIZES, type GraphicType, type SizeKey, type StyleKey } from '@/lib/social/types'

/* The composer's two lower panels. They load on demand (next/dynamic in SocialComposer) so the first screen's script stays small. */
export type NetworkChoice = { id: Network; label: string; sizes: SizeKey[]; maxChars: number; maxHashtags: number }
export type EditPost = { id: number; status: string; caption: string; hashtags: string[]; targets: { network: Network; size: SizeKey }[]; date: string; time: string }
export type Scheduling = {
  networks: NetworkChoice[]
  unavailable: { id: string; label: string }[]
  siteUrlOk: boolean
  tz: string
  locale: string
  window: PublishWindow
  defaultDate: string
  heartbeat: { lastChecked: string; warning: string | null; cadence: string | null }
  edit: EditPost | null
}

export type CaptionSettings = { hashtags: string[]; signOff: string; templates: Record<GraphicType, string> }

/** The editor-writable settings: hashtags, the sign-off line and the wording of each caption. */
export function CaptionPanel({ type, settings }: { type: GraphicType | ''; settings: CaptionSettings }) {
  const [tags, setTags] = useState(settings.hashtags.join(' '))
  const [signOff, setSignOff] = useState(settings.signOff)
  const [templates, setTemplates] = useState(settings.templates)
  const [busy, setBusy] = useState(false)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const res = await saveCaptionSettings({ hashtags: tags.split(/[\s,]+/).filter(Boolean), signOff, captionTemplates: templatesToSave(templates) })
    setBusy(false)
    if (res.ok) toast.success('Saved.')
    else toast.error(res.error)
  }
  return (
    <details className="club-panel">
      <summary className="club-field__title">Captions and hashtags</summary>
      <form onSubmit={save} className="club-stack">
        <label className="social__field">
          <span className="club-field__title">Hashtags</span>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
          <span className="club-muted">Separate with spaces, without the # sign.</span>
        </label>
        <label className="social__field">
          <span className="club-field__title">Sign-off line</span>
          <input type="text" value={signOff} maxLength={200} onChange={(e) => setSignOff(e.target.value)} />
        </label>
        {(Object.keys(templates) as GraphicType[]).filter((t) => !type || t === type).map((t) => (
          <label key={t} className="social__field">
            <span className="club-field__title">Caption wording: {t.replace('-', ' ')}</span>
            <textarea rows={4} maxLength={600} value={templates[t]} onChange={(e) => setTemplates({ ...templates, [t]: e.target.value })} />
          </label>
        ))}
        <p className="club-muted">Words in curly brackets, such as {'{club}'}, {'{opponent}'} or {'{link}'}, are filled in from the game. A line with a missing value is left out.</p>
        <button type="submit" className="social__button social__button--primary" disabled={busy}>Save captions and hashtags</button>
      </form>
    </details>
  )
}

/**
 * Step 4: save a draft or schedule (wave C spec 4.1). Scheduling is the human approval. Only networks the site can really send to are
 * offered; the others say so and the download and copy buttons above are the way to post. Every reason Schedule is off is written out.
 */
export function SchedulePanel({ scheduling: s, signOff, tags, caption, spec }: { scheduling: Scheduling; signOff: string; tags: string[]; caption: string; spec: { type: GraphicType | ''; source: string; text: string; style: StyleKey | null } }) {
  const edit = s.edit
  const [picked, setPicked] = useState<Record<string, SizeKey>>(() => Object.fromEntries((edit?.targets ?? []).map((t) => [t.network, t.size])))
  const [date, setDate] = useState(edit?.date || s.defaultDate)
  const [time, setTime] = useState(edit?.time || '18:30')
  const [outside, setOutside] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selected = Object.entries(picked).map(([network, size]) => ({ network: network as Network, size }))
  const finals = selected.map((t) => {
    const net = s.networks.find((n) => n.id === t.network)
    if (!net) return { network: t.network, label: t.network, text: '', length: 0, max: 0, errors: [] as string[], warnings: [] as string[] }
    const text = composeFinalText({ body: caption, signOff, hashtags: tags, limits: net })
    const check = validateCaption(net.id, text, net, net.label)
    return { network: net.id, label: net.label, text, length: networkLength(net.id, text), max: net.maxChars, ...check }
  })
  const timeCheck = date && time ? checkScheduleTime({ date, time, tz: s.tz, now: new Date(), window: s.window, allowOutside: outside }) : ({ ok: false, error: 'Choose a date and time to post.' } as const)
  const needsTick = Boolean(time) && !insideWindow(time, s.window)
  const blockers = scheduleBlockers({ body: caption, networks: s.networks, selected, siteUrlOk: s.siteUrlOk, captionErrors: finals.flatMap((f) => f.errors), timeError: timeCheck.ok ? null : timeCheck.error })
  const form = () => ({ id: edit?.id, type: spec.type, source: spec.source, text: spec.text, style: spec.style, caption, hashtags: tags, targets: selected, date, time, allowOutside: outside })

  const go = async (mode: 'draft' | 'schedule') => {
    setBusy(true)
    setError('')
    const r = mode === 'draft' ? await saveDraft(form()) : await schedulePost(form())
    setBusy(false)
    if (!r.ok) { setError(r.error); toast.error(r.error); return }
    toast.success(mode === 'draft' ? 'Saved as a draft.' : 'Scheduled.')
    // A full reload on purpose: it clears the composer and shows the queue with the new post.
    window.location.replace(`${window.location.pathname}?tab=${mode === 'draft' ? 'drafts' : 'scheduled'}`)
  }

  return (
    <section aria-labelledby="social-step-4" className="club-panel">
      <h2 id="social-step-4" className="club-field__title">4. Schedule it</h2>
      {edit?.status === 'scheduled' && <p role="status">Saving changes moves this post back to a draft. Schedule it again when you are happy with it.</p>}
      {s.networks.length > 0 ? (
        <fieldset className="social__list">
          <legend className="club-field__title">Where should it go?</legend>
          {s.networks.map((n) => (
            <div key={n.id} className="social__net">
              <label className="social__choice">
                <input type="checkbox" checked={n.id in picked} onChange={(e) => setPicked((p) => { const next = { ...p }; if (e.target.checked) next[n.id] = n.sizes[0]; else delete next[n.id]; return next })} />
                <span>{n.label}</span>
              </label>
              {n.id in picked && (
                <label>
                  <span className="sr-only">Picture size for {n.label}</span>
                  <select value={picked[n.id]} onChange={(e) => setPicked((p) => ({ ...p, [n.id]: e.target.value as SizeKey }))}>
                    {n.sizes.map((z) => <option key={z} value={z}>{SIZES[z].label}</option>)}
                  </select>
                </label>
              )}
            </div>
          ))}
        </fieldset>
      ) : (
        <p>No network is connected for scheduling yet. Download the picture above and post it by hand.</p>
      )}
      {s.unavailable.map((n) => <p key={n.id} className="club-muted">{NOT_AVAILABLE(n.label)}</p>)}

      {finals.filter((f) => f.text).map((f) => (
        <div key={f.network} className="social__field">
          <span className="club-field__title">{f.label}: the words that will go out</span>
          <pre className="social__final">{f.text}</pre>
          <span className="club-muted">{f.length} of {f.max} characters</span>
          {f.warnings.map((w) => <span key={w} className="club-muted">{w}</span>)}
        </div>
      ))}

      <div className="social__when">
        <label className="social__field">
          <span className="club-field__title">Post on</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="social__field">
          <span className="club-field__title">At (club time)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <p className="club-muted">{s.heartbeat.lastChecked}. {s.heartbeat.cadence ?? 'Posts go out when the scheduler next checks. Until it has been seen running more than once, assume a post may go out up to a day after the time you pick.'}</p>
      {s.heartbeat.warning && <p role="alert"><span aria-hidden="true">! </span>{s.heartbeat.warning}</p>}
      {needsTick && (
        <label className="social__choice">
          <input type="checkbox" checked={outside} onChange={(e) => setOutside(e.target.checked)} />
          <span>{quietHoursText(s.window, s.locale)}</span>
        </label>
      )}

      {blockers.length > 0 && (
        <ul className="social__blockers" id="social-blockers" role="status">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="club-actions">
        <button type="button" className="social__button" disabled={busy || !spec.type} onClick={() => go('draft')}>Save as draft</button>
        <button type="button" className="social__button social__button--primary" disabled={busy || blockers.length > 0} aria-describedby={blockers.length ? 'social-blockers' : undefined} onClick={() => go('schedule')}>Schedule</button>
      </div>
    </section>
  )
}
