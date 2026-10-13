'use client'

import { toast } from '@payloadcms/ui'
import { useState } from 'react'
import { saveCaptionSettings } from '@/lib/social-actions'
import { templatesToSave } from '@/lib/social/caption'
import { quietHoursText } from '@/lib/social/schedule-time'
import { NOT_AVAILABLE } from '@/lib/social/queue-view'
import type { CaptionSettings, ScheduleForm, Scheduling, scheduleView } from '@/lib/social/schedule-view'
import { SIZES, type GraphicType, type SizeKey } from '@/lib/social/types'
import { Button, Disclosure } from './ui'

/* The composer's lower panels. They load on demand (next/dynamic in SocialComposer) so the first screen's script stays small. */
export type { CaptionSettings, EditPost, NetworkChoice, Scheduling } from '@/lib/social/schedule-view'

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
    <Disclosure summary="Caption wording, hashtags and sign-off (for every post)" className="social-settings">
      <form onSubmit={save} className="social-form">
        <label className="social-field">
          <span className="social-label">Hashtags</span>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} />
          <span className="social-hint">Separate with spaces, without the # sign.</span>
        </label>
        <label className="social-field">
          <span className="social-label">Sign-off line</span>
          <input type="text" value={signOff} maxLength={200} onChange={(e) => setSignOff(e.target.value)} />
        </label>
        {(Object.keys(templates) as GraphicType[]).filter((t) => !type || t === type).map((t) => (
          <label key={t} className="social-field">
            <span className="social-label">Caption wording: {t.replace('-', ' ')}</span>
            <textarea rows={4} maxLength={600} value={templates[t]} onChange={(e) => setTemplates({ ...templates, [t]: e.target.value })} />
          </label>
        ))}
        <p className="social-hint">Words in curly brackets, such as {'{club}'}, {'{opponent}'} or {'{link}'}, are filled in from the game. A line with a missing value is left out.</p>
        <Button type="submit" busy={busy}>Save captions and hashtags</Button>
      </form>
    </Disclosure>
  )
}

type View = ReturnType<typeof scheduleView>

/**
 * Where and when to post (wave C spec 4.1). Scheduling is the human approval. Only networks the site can really send to are offered;
 * the others say so, and Download and Share are the way to post. Every reason Schedule is off is written out. The form state and the
 * two actions live in the composer (so "Save draft" and "Schedule..." beside the preview use the same state); this only shows them.
 */
export function SchedulePanel({ scheduling: s, form, setForm, view, busy, error, onSave }: { scheduling: Scheduling; form: ScheduleForm; setForm: (f: ScheduleForm) => void; view: View; busy: boolean; error: string; onSave: (mode: 'draft' | 'schedule') => void }) {
  const edit = s.edit
  const { finals, needsTick, blockers } = view
  return (
    <div className="social-schedule">
      {edit?.status === 'scheduled' && <p role="status" className="social-note">Saving changes moves this post back to a draft. Schedule it again when you are happy with it.</p>}
      {s.networks.length > 0 ? (
        <fieldset className="social-fieldset">
          <legend className="social-label">Where should it go?</legend>
          {s.networks.map((n) => (
            <div key={n.id} className="social-net">
              <label className="social-check">
                <input type="checkbox" checked={n.id in form.picked} onChange={(e) => { const next = { ...form.picked }; if (e.target.checked) next[n.id] = n.sizes[0]; else delete next[n.id]; setForm({ ...form, picked: next }) }} />
                <span>{n.label}</span>
              </label>
              {n.id in form.picked && (
                <label>
                  <span className="ui-sr-only">Picture size for {n.label}</span>
                  <select value={form.picked[n.id]} onChange={(e) => setForm({ ...form, picked: { ...form.picked, [n.id]: e.target.value as SizeKey } })}>
                    {n.sizes.map((z) => <option key={z} value={z}>{SIZES[z].label}</option>)}
                  </select>
                </label>
              )}
            </div>
          ))}
        </fieldset>
      ) : (
        <p className="social-note">No network is connected for scheduling yet. Download the picture, or share it from your phone, and post it by hand.</p>
      )}
      {s.unavailable.map((n) => <p key={n.id} className="social-hint">{NOT_AVAILABLE(n.label)}</p>)}

      {finals.filter((f) => f.text).map((f) => (
        <div key={f.network} className="social-field">
          <span className="social-label">{f.label}: the words that will go out</span>
          <pre className="social-final">{f.text}</pre>
          <span className="social-hint">{f.length} of {f.max} characters</span>
          {f.warnings.map((w) => <span key={w} className="social-hint">{w}</span>)}
        </div>
      ))}

      <div className="social-when">
        <label className="social-field">
          <span className="social-label">Post on</span>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </label>
        <label className="social-field">
          <span className="social-label">At (club time)</span>
          <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
        </label>
      </div>
      <p className="social-hint">{s.heartbeat.plain ?? s.heartbeat.lastChecked}. {s.heartbeat.cadence ?? 'A scheduled post goes out when the job next runs, which can be up to a day after the time you pick.'}</p>
      {s.heartbeat.warning && <p role="alert" className="social-warn"><span aria-hidden="true">! </span>{s.heartbeat.warning}</p>}
      {needsTick && (
        <label className="social-check">
          <input type="checkbox" checked={form.outside} onChange={(e) => setForm({ ...form, outside: e.target.checked })} />
          <span>{quietHoursText(s.window, s.locale)}</span>
        </label>
      )}

      {blockers.length > 0 && (
        <ul className="social-blockers" id="social-blockers" role="status">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="social-warn">{error}</p>}
      <div className="social-actions">
        <Button variant="secondary" disabled={busy} onClick={() => onSave('draft')}>Save as draft</Button>
        <Button disabled={busy || blockers.length > 0} aria-describedby={blockers.length ? 'social-blockers' : undefined} onClick={() => onSave('schedule')}>Schedule</Button>
      </div>
    </div>
  )
}
