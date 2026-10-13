'use client'

import { toast } from '@payloadcms/ui'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveDraft, schedulePost } from '@/lib/social-actions'
import { composeCopyText } from '@/lib/social/caption'
import { composeFinalText, networkLength } from '@/lib/social/final-text'
import { postForm, scheduleView, type ScheduleForm } from '@/lib/social/schedule-view'
import { canShareFile, sharePayload } from '@/lib/social/share'
import { TYPE_ICONS } from '@/lib/social/type-icons'
import { composerSearch, dropUnknownSources, parseComposerUrl } from '@/lib/social/url-state'
import { SIZE_KEYS, SIZES, STYLE_KEYS, STYLE_LABELS, type GraphicType, type SizeKey, type SourceChoice, type SourceList, type StyleKey } from '@/lib/social/types'
import type { CaptionSettings, Scheduling } from './SocialPanels'
import { SearchPicker } from './social/SearchPicker'
import { Step } from './social/Step'
import { useVisualViewport } from './social/useVisualViewport'
import { Button, Icon, SkeletonRows } from './ui'
import { useHydrated } from './useHydrated'

// The lower panels are only needed once a picture is chosen, so their script loads on demand.
const panelSkeleton = (label: string) => function PanelSkeleton() { return <p className="social-hint" role="status" aria-busy="true">{label}</p> }
const SchedulePanel = dynamic(() => import('./SocialPanels').then((m) => m.SchedulePanel), { ssr: false, loading: panelSkeleton('Getting the scheduling options ready...') })
const CaptionPanel = dynamic(() => import('./SocialPanels').then((m) => m.CaptionPanel), { ssr: false, loading: panelSkeleton('Getting the caption settings ready...') })

type TypeTile = { key: GraphicType; label: string; hint: string; textField: { label: string; hint: string } | null }
type Props = {
  scheduling: Scheduling
  api: string
  /** The Posts tab, for the link after a download or a save. */
  postsHref: string
  types: TypeTile[]
  defaultStyle: StyleKey
  settings: CaptionSettings
  filePrefix: string
  initial: { type: GraphicType | ''; source: string; style: StyleKey | null; size: SizeKey; text: string }
}
type Preview = { state: 'loading' | 'ready' | 'error'; url?: string; blob?: Blob; error?: string }

const ERRORS: Record<number, string> = {
  404: 'That picture could not be made. The game or player may have changed, so pick it again.',
  429: 'Slow down for a minute, then try again.',
}

/**
 * The composer (wave G spec WP-2a). Two columns from 1024px: the steps on the left, the live preview on the right and sticky. On a phone
 * it is one flow, Type, Pick, Preview, Share, with the optional steps (options, caption, schedule, draft) behind "More". One preview at a
 * time: only the selected size is requested, and a size already loaded is kept for the session. Share sends the picture file only.
 */
export function SocialComposer({ api, postsHref, types, defaultStyle, settings, filePrefix, initial, scheduling }: Props) {
  const [type, setType] = useState<GraphicType | ''>(initial.type)
  const [source, setSource] = useState(initial.source)
  const [game, setGame] = useState('')
  const [style, setStyle] = useState<StyleKey>(initial.style ?? defaultStyle)
  const [size, setSize] = useState<SizeKey>(initial.size)
  const [text, setText] = useState(initial.text)
  const [list, setList] = useState<SourceList | null>(null)
  const [listError, setListError] = useState('')
  const [previews, setPreviews] = useState<Record<string, Preview>>({})
  const [caption, setCaption] = useState('')
  const [suggested, setSuggested] = useState('')
  const [handEdited, setHandEdited] = useState(false)
  const [alt, setAlt] = useState('')
  const [warn, setWarn] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [tags, setTags] = useState<string[]>(scheduling.edit?.hashtags ?? settings.hashtags)
  const [form, setForm] = useState<ScheduleForm>(() => ({
    picked: Object.fromEntries((scheduling.edit?.targets ?? []).map((t) => [t.network, t.size])),
    date: scheduling.edit?.date || scheduling.defaultDate,
    time: scheduling.edit?.time || '18:30',
    outside: false,
  }))
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [open, setOpen] = useState({ type: !initial.type, pick: true, options: true, caption: true, schedule: false, more: false })
  const [wide, setWide] = useState(false)
  const cache = useRef<Record<string, Preview>>({})
  const previewRef = useRef<HTMLDivElement>(null)
  // Editing a saved post keeps its caption the first time the standard one arrives.
  const keepCaption = useRef(Boolean(scheduling.edit))
  const tile = types.find((t) => t.key === type) ?? null
  const hydrated = useHydrated()
  const bar = useVisualViewport()

  const params = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ type, source, size, style, ...extra })
    if (text) q.set('text', text)
    return q
  }, [type, source, size, style, text])
  const key = `${type}|${source}|${style}|${size}|${text}`

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // The address is the source of truth, but it is read here, after mount, and never while rendering: the server and the first client
  // render both use the neutral state from props, so there is no hydration mismatch. (On a hard load the server can receive the
  // query late or empty, which is why the composer does not depend on it.) The address is rewritten only after this read.
  const [urlRead, setUrlRead] = useState(false)
  const router = useRouter()
  const fromUrl = useRef(false)
  useEffect(() => {
    const url = parseComposerUrl(window.location.search)
    if (!scheduling.edit && url.type) {
      fromUrl.current = true
      setType(url.type)
      setSource(url.source)
      if (url.style) setStyle(url.style)
      if (url.size) setSize(url.size)
      setText(url.text)
      setOpen((o) => ({ ...o, type: false }))
    }
    // A saved post opened by a link whose query did not reach the server: ask the server again once, now that the address is known.
    if (url.post !== null && !scheduling.edit) router.refresh()
    setUrlRead(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, [])

  useEffect(() => {
    if (!urlRead) return
    const next = composerSearch(window.location.search, { type, source, style, size, text, post: scheduling.edit?.id ?? null })
    if (next !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${next}`)
  }, [urlRead, type, source, style, size, text, scheduling.edit])

  // What can be picked for this type.
  useEffect(() => {
    if (!type) return
    let live = true
    setList(null)
    setListError('')
    const q = new URLSearchParams({ type })
    if (type === 'potm' && game) q.set('game', game)
    fetch(`${api}/sources?${q}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load the choices.')
        return (await r.json()) as SourceList
      })
      .then((j) => {
        if (!live) return
        setList(j)
        // Ids that came from the address and are not on offer are dropped (potm lists games first, so it cannot be checked here).
        if (fromUrl.current && type !== 'potm') {
          fromUrl.current = false
          const known = new Set(j.choices.flatMap((c) => [c.id, ...(c.variants?.map((v) => v.id) ?? [])]))
          setSource((current) => dropUnknownSources(current, known))
        }
      })
      .catch((e: Error) => live && setListError(e.message))
    return () => { live = false }
  }, [api, type, game])

  // The preview: only the visible size, after a short pause, and never twice.
  useEffect(() => {
    if (!type || !source) return
    if (cache.current[key]?.state === 'ready') { setPreviews((p) => ({ ...p, [key]: cache.current[key] })); return }
    const timer = setTimeout(async () => {
      setPreviews((p) => ({ ...p, [key]: { state: 'loading' } }))
      try {
        const res = await fetch(`${api}/graphic?${params()}`, { credentials: 'include' })
        if (!res.ok) throw new Error((res.status === 404 && type === 'toss' ? 'Toss details are not in yet for this game.' : ERRORS[res.status]) ?? 'The picture could not be made. Please try again.')
        const blob = await res.blob()
        const entry: Preview = { state: 'ready', url: URL.createObjectURL(blob), blob }
        cache.current[key] = entry
        setPreviews((p) => ({ ...p, [key]: entry }))
      } catch (e) {
        setPreviews((p) => ({ ...p, [key]: { state: 'error', error: (e as Error).message } }))
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [api, key, params, type, source])

  // The caption follows the choice and the text, not the size or style.
  useEffect(() => {
    if (!type || !source) { setCaption(''); setSuggested(''); return }
    let live = true
    const q = new URLSearchParams({ type, source })
    if (text) q.set('text', text)
    fetch(`${api}/caption?${q}`, { credentials: 'include' })
      .then(async (r) => (r.ok ? ((await r.json()) as { text: string; unknown: string[]; alt: string }) : null))
      .then((j) => {
        if (!live) return
        setSuggested(j?.text ?? '')
        if (keepCaption.current) {
          setCaption(scheduling.edit?.caption ?? '')
          keepCaption.current = false
        } else {
          setCaption(j?.text ?? '')
          setHandEdited(false)
        }
        setAlt(j?.alt ?? '')
        setWarn(j?.unknown ?? [])
      })
      .catch(() => live && !keepCaption.current && setCaption(''))
    return () => { live = false }
  }, [api, type, source, text, scheduling.edit])

  useEffect(() => {
    const store = cache.current
    return () => Object.values(store).forEach((p) => p.url && URL.revokeObjectURL(p.url))
  }, [])

  // Leaving with a caption changed by hand and not saved is the one thing worth asking about.
  useEffect(() => {
    if (!handEdited) return
    const warnUnsaved = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warnUnsaved)
    return () => window.removeEventListener('beforeunload', warnUnsaved)
  }, [handEdited])

  const preview = previews[key]
  const filename = `${filePrefix}-${type}-${size}.png`
  const fullCaption = useMemo(() => composeCopyText({ body: caption, signOff: settings.signOff, hashtags: tags }), [caption, settings.signOff, tags])
  const view = useMemo(() => scheduleView({ scheduling, signOff: settings.signOff, tags, caption, form, now: new Date() }), [scheduling, settings.signOff, tags, caption, form])
  const counts = useMemo(
    () => scheduling.networks.map((n) => ({ id: n.id, label: n.label, max: n.maxChars, length: networkLength(n.id, composeFinalText({ body: caption, signOff: settings.signOff, hashtags: tags, limits: n })) })),
    [scheduling.networks, caption, settings.signOff, tags],
  )
  const ready = Boolean(tile && source)
  const canShare = typeof navigator !== 'undefined' && preview?.blob ? canShareFile(navigator as never, new File([preview.blob], filename, { type: 'image/png' })) : false

  const pickType = (t: GraphicType) => {
    keepCaption.current = false
    setType(t)
    setSource('')
    setGame('')
    setText('')
    setStatus('')
    setOpen((o) => ({ ...o, type: false, pick: true }))
  }
  const choose = (ids: string[]) => {
    if (!list) return
    if (list.multi) { setSource(ids.join(',')); return }
    const c = list.choices.find((x) => x.id === ids[0])
    if (!c) return
    if (type === 'potm' && !game) { setGame(c.id); return }
    setSource(c.id)
    setStatus('')
  }
  const selected: SourceChoice | null = list?.choices.find((c) => c.id === source || c.variants?.some((v) => v.id === source)) ?? null
  const selectedIds = list?.multi ? (source ? source.split(',') : []) : source ? [source] : []
  const summaryOfPick = list?.multi ? selectedIds.map((id) => nameOf(list.choices, id)).join(', ') : selected ? nameOf([selected], selected.id) : ''

  const download = () => {
    if (!preview?.url) return
    const a = document.createElement('a')
    a.href = preview.url
    a.download = filename
    a.click()
    setStatus(`Saved ${filename} to your downloads.`)
  }
  const share = async () => {
    if (!preview?.blob) return
    const file = new File([preview.blob], filename, { type: 'image/png' })
    try {
      await navigator.share(sharePayload(file, tile?.label))
      setStatus('Shared the picture.')
    } catch {
      /* the person closed the share sheet */
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullCaption)
      setStatus('Caption copied.')
    } catch {
      setStatus('Could not copy. Select the caption and copy it by hand.')
    }
  }
  const go = async (mode: 'draft' | 'schedule') => {
    setBusy(true)
    setSaveError('')
    const body = postForm({ edit: scheduling.edit, spec: { type, source, text, style }, caption, tags, form })
    const r = mode === 'draft' ? await saveDraft(body) : await schedulePost(body)
    setBusy(false)
    if (!r.ok) { setSaveError(r.error); toast.error(r.error); return }
    setHandEdited(false)
    toast.success(mode === 'draft' ? 'Saved as a draft.' : 'Scheduled.')
    // A full reload on purpose: it clears the composer and shows the queue with the new post.
    window.location.replace(`${postsHref}&status=${mode === 'draft' ? 'drafts' : 'scheduled'}`)
  }
  const openSchedule = () => {
    setOpen((o) => ({ ...o, more: true, schedule: true }))
    requestAnimationFrame(() => document.getElementById('social-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const scrollToPreview = () => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const sizeTabs = (
    <div role="tablist" aria-label="Picture size" className="social-sizes">
      {SIZE_KEYS.map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          id={`social-size-${s}`}
          aria-selected={s === size}
          tabIndex={s === size ? 0 : -1}
          className="social-size"
          onClick={() => setSize(s)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
            e.preventDefault()
            const next = SIZE_KEYS[(SIZE_KEYS.indexOf(s) + (e.key === 'ArrowRight' ? 1 : SIZE_KEYS.length - 1)) % SIZE_KEYS.length]
            setSize(next)
            document.getElementById(`social-size-${next}`)?.focus()
          }}
        >
          <span>{SIZES[s].label}</span>
          <small>{SIZES[s].width} x {SIZES[s].height}</small>
        </button>
      ))}
    </div>
  )

  return (
    <div className="social-compose" aria-busy={!hydrated} data-ready={ready ? 'yes' : 'no'}>
      <div className="social-area social-area--type">
        <Step n={1} id="social-s1" title="What kind of post" summary={tile?.label} open={open.type} onToggle={() => setOpen((o) => ({ ...o, type: !o.type }))}>
          <fieldset className="social-types">
            <legend className="ui-sr-only">Kinds of post</legend>
            {types.map((t) => (
              <label key={t.key} className={`social-card${t.key === type ? ' is-on' : ''}`}>
                <input type="radio" name="social-type" className="ui-sr-only" checked={t.key === type} disabled={!hydrated} onChange={() => pickType(t.key)} />
                <Icon name={TYPE_ICONS[t.key]} size={22} className="social-card__icon" />
                <span className="social-card__label">{t.label}</span>
                <span className="social-card__hint">{t.hint}</span>
              </label>
            ))}
          </fieldset>
        </Step>
      </div>

      <div className="social-area social-area--pick">
        {tile ? (
          <Step n={2} id="social-s2" title={type === 'potm' && !game ? 'Which game?' : type === 'potm' ? 'Which player?' : pickTitle(type)} summary={summaryOfPick} open={open.pick} onToggle={() => setOpen((o) => ({ ...o, pick: !o.pick }))}>
            {type === 'potm' && game ? <Button variant="quiet" onClick={() => { setGame(''); setSource('') }}>Back to the games</Button> : null}
            {listError ? <p role="alert" className="social-warn">{listError}</p> : null}
            {!list && !listError ? <SkeletonRows rows={4} label="Loading the choices" /> : null}
            {list ? (
              <SearchPicker
                key={`${type}-${game}`}
                choices={list.choices}
                multi={Boolean(list.multi)}
                selected={selectedIds}
                onChange={choose}
                api={api}
                locale={scheduling.locale}
                label={type === 'potm' && !game ? 'Games' : pickTitle(type)}
                empty={list.empty}
                disabled={!hydrated}
              />
            ) : null}
            {selected?.variants ? (
              <fieldset className="social-fieldset">
                <legend className="social-label">Show</legend>
                <div className="social-seg" role="radiogroup">
                  {selected.variants.map((v) => (
                    <label key={v.id} className={`social-seg__item${source === v.id ? ' is-on' : ''}`}>
                      <input type="radio" name="social-variant" className="ui-sr-only" checked={source === v.id} onChange={() => setSource(v.id)} />
                      {v.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </Step>
        ) : null}
      </div>

      <aside className="social-area social-area--preview" aria-label="Preview" ref={previewRef}>
        <div className="social-previewcard">
          {sizeTabs}
          <div
            className={`social-frame${ready ? '' : ' is-idle'}`}
            style={{ aspectRatio: `${SIZES[size].width} / ${SIZES[size].height}` }}
            role="tabpanel"
            aria-labelledby={`social-size-${size}`}
            aria-busy={ready && preview?.state !== 'ready' && preview?.state !== 'error'}
          >
            {ready && preview?.state === 'ready' && preview.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob URL from this page, not a site image
              <img src={preview.url} alt={`${tile?.label ?? 'Post'} picture, ${SIZES[size].label.toLowerCase()} size${alt ? `: ${alt}` : ''}`} />
            ) : ready && preview?.state === 'error' ? (
              <p role="alert" className="social-warn">{preview.error}</p>
            ) : ready ? (
              <>
                <span className="ui-skel social-frame__skel" aria-hidden="true" />
                <p className="social-hint" role="status">Making the picture...</p>
              </>
            ) : (
              <p className="social-hint">{tile ? 'Pick one above and your picture appears here.' : 'Choose what to post and your picture appears here.'}</p>
            )}
          </div>
          <div className="social-actions social-actions--desktop">
            <Button disabled={!hydrated || preview?.state !== 'ready'} onClick={download}><Icon name="download" size={18} />Download</Button>
            {canShare ? <Button variant="secondary" onClick={share}><Icon name="social" size={18} />Share</Button> : null}
            <Button variant="secondary" disabled={!ready} onClick={openSchedule}><Icon name="clock" size={18} />Schedule...</Button>
            <Button variant="secondary" disabled={!ready || busy} busy={busy} onClick={() => go('draft')}><Icon name="save" size={18} />Save draft</Button>
          </div>
          {canShare ? <p className="social-hint social-actions--desktop">Share sends the picture only.</p> : null}
          <p role="status" aria-live="polite" className="social-status">
            {status}
            {status ? <> <a href={postsHref}>See your posts</a></> : null}
          </p>
        </div>
      </aside>

      <div className="social-area social-area--more">
        <details className="social-more" open={wide || open.more} onToggle={(e) => { const o = (e.currentTarget as HTMLDetailsElement).open; setOpen((s) => (s.more === o ? s : { ...s, more: o })) }}>
          <summary className="social-more__summary">More: options, caption, schedule</summary>
          {ready ? (
            <div className="social-more__body">
              <Step n={3} id="social-s3" title="Options" summary={STYLE_LABELS[style]} open={open.options} onToggle={() => setOpen((o) => ({ ...o, options: !o.options }))}>
                <fieldset className="social-fieldset">
                  <legend className="social-label">Style</legend>
                  <div className="social-styles" role="radiogroup">
                    {STYLE_KEYS.map((s) => (
                      <label key={s} className={`social-style${style === s ? ' is-on' : ''}`}>
                        <input type="radio" name="social-style" className="ui-sr-only" checked={style === s} onChange={() => setStyle(s)} />
                        <span className={`social-swatch social-swatch--${s}`} aria-hidden="true"><i /><i /></span>
                        <span>{STYLE_LABELS[s]}{s === defaultStyle ? ' (club style)' : ''}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {tile?.textField ? (
                  <label className="social-field">
                    <span className="social-label">{tile.textField.label}</span>
                    <input type="text" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
                    <span className="social-hint">{tile.textField.hint}</span>
                  </label>
                ) : null}
              </Step>

              <Step n={4} id="social-s4" title="Caption" summary={caption ? `${caption.slice(0, 40)}${caption.length > 40 ? '...' : ''}` : undefined} open={open.caption} onToggle={() => setOpen((o) => ({ ...o, caption: !o.caption }))}>
                <label className="social-field">
                  <span className="social-label">Caption</span>
                  <textarea rows={7} value={caption} onChange={(e) => { setCaption(e.target.value); setHandEdited(true) }} />
                </label>
                {counts.length > 0 ? (
                  <ul className="social-counts" aria-label="Characters per network">
                    {counts.map((c) => <li key={c.id} className={c.length > c.max ? 'is-over' : ''}>{c.label}: {c.length} of {c.max}</li>)}
                  </ul>
                ) : null}
                <p className="social-hint">Copying adds your sign-off and hashtags.</p>
                {warn.length > 0 ? <p role="status" className="social-hint">These words in the caption wording were not recognised and are left as they are: {warn.map((w) => `{${w}}`).join(', ')}.</p> : null}
                {settings.hashtags.length > 0 ? (
                  <fieldset className="social-fieldset">
                    <legend className="social-label">Hashtags for this post</legend>
                    <ul className="social-tags">
                      {settings.hashtags.map((h) => (
                        <li key={h}>
                          <label className={`social-tag-chip${tags.includes(h) ? ' is-on' : ''}`}>
                            <input type="checkbox" className="ui-sr-only" checked={tags.includes(h)} onChange={(e) => setTags(e.target.checked ? [...tags, h] : tags.filter((x) => x !== h))} />
                            #{h}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                ) : null}
                <div className="social-actions">
                  <Button variant="secondary" onClick={copy} disabled={!caption}>Copy caption</Button>
                  <Button variant="quiet" onClick={() => { setCaption(suggested); setHandEdited(false) }} disabled={!suggested || caption === suggested}>Reset to suggested</Button>
                </div>
              </Step>

              <div id="social-schedule">
                <Step n={5} id="social-s5" title="Schedule or save for later" summary={form.date && form.time ? `${form.date} ${form.time}` : undefined} open={open.schedule} onToggle={() => setOpen((o) => ({ ...o, schedule: !o.schedule }))}>
                  <SchedulePanel scheduling={scheduling} form={form} setForm={setForm} view={view} busy={busy} error={saveError} onSave={go} />
                </Step>
              </div>
              <CaptionPanel type={type} settings={settings} />
            </div>
          ) : (
            <p className="social-hint social-more__body">Options, the caption and scheduling appear once you have picked something to post.</p>
          )}
        </details>
      </div>

      {ready && bar.visible ? (
        <div className="social-bar" style={{ bottom: bar.inset }} role="region" aria-label="Picture actions">
          {sizeTabs}
          <div className="social-bar__row">
            <Button variant="secondary" onClick={scrollToPreview}>Preview</Button>
            {canShare ? <Button variant="secondary" onClick={share}>Share</Button> : null}
            <Button disabled={!hydrated || preview?.state !== 'ready'} onClick={download}>Download</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function pickTitle(type: GraphicType | ''): string {
  switch (type) {
    case 'sponsor-thanks': return 'Which sponsors?'
    case 'event-promo': return 'Which event?'
    case 'fixtures': return 'Which weekend?'
    case 'stats-leaders': return 'Which table?'
    case 'milestone': return 'Which player?'
    case 'season-wrap': return 'Which yearbook?'
    case 'lineup': return 'Which team?'
    default: return 'Which game?'
  }
}

function nameOf(choices: readonly SourceChoice[], id: string): string {
  const c = choices.find((x) => x.id === id)
  return c?.row?.kind === 'sponsor' ? c.row.name : (c?.label ?? id)
}
