'use client'

import { toast } from '@payloadcms/ui'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { saveCaptionSettings } from '@/lib/social-actions'
import { composeCopyText, templatesToSave } from '@/lib/social/caption'
import { SIZE_KEYS, SIZES, STYLE_KEYS, STYLE_LABELS, type GraphicType, type SizeKey, type SourceChoice, type SourceList, type StyleKey } from '@/lib/social/types'

type TypeTile = { key: GraphicType; label: string; hint: string; textField: { label: string; hint: string } | null }
type Props = {
  api: string
  types: TypeTile[]
  defaultStyle: StyleKey
  settings: { hashtags: string[]; signOff: string; templates: Record<GraphicType, string> }
  filePrefix: string
  initial: { type: GraphicType | ''; source: string; style: StyleKey | null; size: SizeKey; text: string }
}
type Preview = { state: 'loading' | 'ready' | 'error'; url?: string; blob?: Blob; error?: string }

const ERRORS: Record<number, string> = {
  404: 'That picture could not be made. The game or player may have changed, so pick it again.',
  429: 'Slow down for a minute, then try again.',
}

/**
 * The composer (wave C spec 3.5). One preview at a time: only the selected size is requested, and a size already loaded is kept for
 * the session. Share uses the phone's share sheet (Save Image goes to Photos) and falls back to a normal download everywhere else.
 */
export function SocialComposer({ api, types, defaultStyle, settings, filePrefix, initial }: Props) {
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
  const [alt, setAlt] = useState('')
  const [warn, setWarn] = useState<string[]>([])
  const [announce, setAnnounce] = useState('')
  const cache = useRef<Record<string, Preview>>({})
  const tile = types.find((t) => t.key === type) ?? null

  const params = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ type, source, size, style, ...extra })
    if (text) q.set('text', text)
    return q
  }, [type, source, size, style, text])
  const key = `${type}|${source}|${style}|${size}|${text}`

  // The choice lives in the address, so a refresh or a shared link keeps it.
  useEffect(() => {
    const q = new URLSearchParams()
    if (type) q.set('type', type)
    if (source) q.set('source', source)
    if (source) q.set('style', style)
    if (source) q.set('size', size)
    if (text) q.set('text', text)
    window.history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}`)
  }, [type, source, style, size, text])

  // Step 1: what can be picked for this type.
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
      .then((j) => live && setList(j))
      .catch((e: Error) => live && setListError(e.message))
    return () => { live = false }
  }, [api, type, game])

  // Step 2: only the visible size, after a short pause, and never twice.
  useEffect(() => {
    if (!type || !source) return
    if (cache.current[key]?.state === 'ready') { setPreviews((p) => ({ ...p, [key]: cache.current[key] })); return }
    const timer = setTimeout(async () => {
      setPreviews((p) => ({ ...p, [key]: { state: 'loading' } }))
      try {
        const res = await fetch(`${api}/graphic?${params()}`, { credentials: 'include' })
        if (!res.ok) throw new Error(ERRORS[res.status] ?? 'The picture could not be made. Please try again.')
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
    if (!type || !source) { setCaption(''); return }
    let live = true
    const q = new URLSearchParams({ type, source })
    if (text) q.set('text', text)
    fetch(`${api}/caption?${q}`, { credentials: 'include' })
      .then(async (r) => (r.ok ? ((await r.json()) as { text: string; unknown: string[]; alt: string }) : null))
      .then((j) => {
        if (!live) return
        setCaption(j?.text ?? '')
        setAlt(j?.alt ?? '')
        setWarn(j?.unknown ?? [])
      })
      .catch(() => live && setCaption(''))
    return () => { live = false }
  }, [api, type, source, text])

  useEffect(() => {
    const store = cache.current
    return () => Object.values(store).forEach((p) => p.url && URL.revokeObjectURL(p.url))
  }, [])

  const preview = previews[key]
  const filename = `${filePrefix}-${type}-${size}.png`
  const fullCaption = useMemo(() => composeCopyText({ body: caption, signOff: settings.signOff, hashtags: settings.hashtags }), [caption, settings])

  const pick = (t: GraphicType) => { setType(t); setSource(''); setGame(''); setText(''); }
  const download = () => {
    if (!preview?.url) return
    const a = document.createElement('a')
    a.href = preview.url
    a.download = filename
    a.click()
  }
  const share = async () => {
    if (!preview?.blob) return
    const file = new File([preview.blob], filename, { type: 'image/png' })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: fullCaption })
      } catch {
        /* the person closed the share sheet */
      }
    } else download()
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullCaption)
      setAnnounce('Caption copied.')
    } catch {
      setAnnounce('Could not copy. Select the caption and copy it by hand.')
    }
  }

  const choose = (c: SourceChoice) => {
    if (type === 'potm' && !game) { setGame(c.id); return }
    setSource(c.id)
  }
  const selected = list?.choices.find((c) => c.id === source || c.variants?.some((v) => v.id === source)) ?? null
  const multiIds = list?.multi && source ? source.split(',') : []

  return (
    <div className="club-stack social">
      <section aria-labelledby="social-step-1" className="club-panel">
        <h2 id="social-step-1" className="club-field__title">1. What do you want to post?</h2>
        <div className="social__tiles" role="group" aria-label="Kinds of picture">
          {types.map((t) => (
            <button key={t.key} type="button" className="social__tile" aria-pressed={t.key === type} onClick={() => pick(t.key)}>
              <strong>{t.label}</strong>
              <span className="club-muted">{t.hint}</span>
            </button>
          ))}
        </div>
        {tile && (
          <div className="social__choices">
            <h3 className="club-field__title">{type === 'potm' && !game ? 'Which game?' : type === 'potm' ? 'Which player?' : 'Which one?'}</h3>
            {type === 'potm' && game && <button type="button" className="club-button-link" onClick={() => { setGame(''); setSource('') }}>Back to the games</button>}
            {listError && <p role="alert">{listError}</p>}
            {!list && !listError && <p className="club-muted">Loading...</p>}
            {list && list.choices.length === 0 && <p className="club-muted">{list.empty}</p>}
            {list && list.choices.length > 0 && (
              <fieldset className="social__list">
                <legend className="sr-only">Choose what the picture is about</legend>
                {list.choices.map((c) => (
                  <label key={c.id} className="social__choice">
                    {list.multi ? (
                      <input
                        type="checkbox"
                        checked={multiIds.includes(c.id)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...multiIds, c.id].slice(0, 4) : multiIds.filter((x) => x !== c.id)
                          setSource(next.join(','))
                        }}
                      />
                    ) : (
                      <input type="radio" name="social-source" checked={selected?.id === c.id} onChange={() => choose(c)} />
                    )}
                    <span>{c.label}</span>
                  </label>
                ))}
                {list.multi && <p className="club-muted">Choose up to four.</p>}
              </fieldset>
            )}
            {selected?.variants && (
              <fieldset className="social__list">
                <legend className="club-field__title">Show</legend>
                {selected.variants.map((v) => (
                  <label key={v.id} className="social__choice">
                    <input type="radio" name="social-variant" checked={source === v.id} onChange={() => setSource(v.id)} />
                    <span>{v.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}
      </section>

      {tile && source && (
        <section aria-labelledby="social-step-2" className="club-panel">
          <h2 id="social-step-2" className="club-field__title">2. Check the picture</h2>
          <div role="group" aria-label="Picture size" className="social__tabs">
            {SIZE_KEYS.map((s) => (
              <button key={s} type="button" aria-pressed={s === size} className="social__tab" onClick={() => setSize(s)}>
                {SIZES[s].label} <span className="club-muted">{SIZES[s].width} x {SIZES[s].height}</span>
              </button>
            ))}
          </div>
          <fieldset className="social__list social__styles">
            <legend className="sr-only">Style</legend>
            {STYLE_KEYS.map((s) => (
              <label key={s} className="social__choice">
                <input type="radio" name="social-style" checked={style === s} onChange={() => setStyle(s)} />
                <span>{STYLE_LABELS[s]}{s === defaultStyle ? ' (club style)' : ''}</span>
              </label>
            ))}
          </fieldset>
          {tile.textField && (
            <label className="social__field">
              <span className="club-field__title">{tile.textField.label}</span>
              <input type="text" value={text} maxLength={80} onChange={(e) => setText(e.target.value)} />
              <span className="club-muted">{tile.textField.hint}</span>
            </label>
          )}
          <div className="social__preview" style={{ aspectRatio: `${SIZES[size].width} / ${SIZES[size].height}` }} aria-busy={preview?.state !== 'ready' && preview?.state !== 'error'}>
            {preview?.state === 'ready' && preview.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob URL from this page, not a site image
              <img src={preview.url} alt={`${tile.label} picture, ${SIZES[size].label.toLowerCase()} size${alt ? `: ${alt}` : ''}`} />
            ) : preview?.state === 'error' ? (
              <p role="alert">{preview.error}</p>
            ) : (
              <p className="club-muted" role="status">Making the picture...</p>
            )}
          </div>
        </section>
      )}

      {tile && source && (
        <section aria-labelledby="social-step-3" className="club-panel">
          <h2 id="social-step-3" className="club-field__title">3. Use it</h2>
          <div className="club-actions">
            <button type="button" className="social__button social__button--primary" onClick={share} disabled={preview?.state !== 'ready'}>Share or save to Photos</button>
            <button type="button" className="social__button" onClick={download} disabled={preview?.state !== 'ready'}>Download picture (PNG)</button>
          </div>
          <label className="social__field">
            <span className="club-field__title">Caption</span>
            <textarea rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <span className="club-muted">Copying adds your sign-off and hashtags from the settings below.</span>
          </label>
          {warn.length > 0 && <p role="status" className="club-muted">These words in the caption wording were not recognised and are left as they are: {warn.map((w) => `{${w}}`).join(', ')}.</p>}
          <button type="button" className="social__button" onClick={copy} disabled={!caption}>Copy caption</button>
          <p role="status" aria-live="polite" className="club-muted">{announce}</p>
        </section>
      )}

      <CaptionPanel type={type} settings={settings} />
    </div>
  )
}

/** The editor-writable settings: hashtags, the sign-off line and the wording of each caption. */
function CaptionPanel({ type, settings }: { type: GraphicType | ''; settings: Props['settings'] }) {
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
