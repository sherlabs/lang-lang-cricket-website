import type { Network } from './adapters/types'
import { composeFinalText, networkLength, validateCaption } from './final-text'
import { scheduleBlockers } from './post-spec'
import { checkScheduleTime, insideWindow, type PublishWindow } from './schedule-time'
import type { GraphicType, SizeKey, StyleKey } from './types'

/** The composer's scheduling facts and the form state, shared by the composer (which owns the state) and the schedule panel (which shows it). */
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
  heartbeat: { lastChecked: string; warning: string | null; cadence: string | null; plain?: string }
  edit: EditPost | null
}
export type CaptionSettings = { hashtags: string[]; signOff: string; templates: Record<GraphicType, string> }
export type ScheduleForm = { picked: Record<string, SizeKey>; date: string; time: string; outside: boolean }

export type PostSpecInput = { type: GraphicType | ''; source: string; text: string; style: StyleKey | null }

/** What the schedule panel shows and what stops Scheduling: every reason is written out. Pure. */
export function scheduleView(o: { scheduling: Scheduling; signOff: string; tags: string[]; caption: string; form: ScheduleForm; now: Date }) {
  const s = o.scheduling
  const selected = Object.entries(o.form.picked).map(([network, size]) => ({ network: network as Network, size }))
  const finals = selected.map((t) => {
    const net = s.networks.find((n) => n.id === t.network)
    if (!net) return { network: t.network, label: t.network, text: '', length: 0, max: 0, errors: [] as string[], warnings: [] as string[] }
    const text = composeFinalText({ body: o.caption, signOff: o.signOff, hashtags: o.tags, limits: net })
    const check = validateCaption(net.id, text, net, net.label)
    return { network: net.id, label: net.label, text, length: networkLength(net.id, text), max: net.maxChars, ...check }
  })
  const timeCheck = o.form.date && o.form.time
    ? checkScheduleTime({ date: o.form.date, time: o.form.time, tz: s.tz, now: o.now, window: s.window, allowOutside: o.form.outside })
    : ({ ok: false, error: 'Choose a date and time to post.' } as const)
  const needsTick = Boolean(o.form.time) && !insideWindow(o.form.time, s.window)
  const blockers = scheduleBlockers({ body: o.caption, networks: s.networks, selected, siteUrlOk: s.siteUrlOk, captionErrors: finals.flatMap((f) => f.errors), timeError: timeCheck.ok ? null : timeCheck.error })
  return { selected, finals, timeCheck, needsTick, blockers }
}

/** The body the save and schedule actions take (the same shape the existing queue actions already validate). */
export function postForm(o: { edit: EditPost | null; spec: PostSpecInput; caption: string; tags: string[]; form: ScheduleForm }) {
  const selected = Object.entries(o.form.picked).map(([network, size]) => ({ network: network as Network, size }))
  return { id: o.edit?.id, type: o.spec.type, source: o.spec.source, text: o.spec.text, style: o.spec.style, caption: o.caption, hashtags: o.tags, targets: selected, date: o.form.date, time: o.form.time, allowOutside: o.form.outside }
}
