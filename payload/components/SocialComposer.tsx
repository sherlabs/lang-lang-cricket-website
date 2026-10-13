'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { composeCopyText } from '@/lib/social/caption'
import { composerSearch, dropUnknownSources, parseComposerUrl } from '@/lib/social/url-state'
import { SIZE_KEYS, SIZES, STYLE_KEYS, STYLE_LABELS, type GraphicType, type SizeKey, type SourceChoice, type SourceList, type StyleKey } from '@/lib/social/types'
import type { CaptionSettings, Scheduling } from './SocialPanels'
import { useHydrated } from './useHydrated'

// The lower panels are only needed once a picture is chosen, so their script loads on demand.
const panelSkeleton = (label: string) => function PanelSkeleton() { return <section className="club-panel" data-admin-skeleton="panel" aria-busy="true"><p className="club-muted" role="status">{label}</p></section> }
const SchedulePanel = dynamic(() => import('./SocialPanels').then((m) => m.SchedulePanel), { ssr: false, loading: panelSkeleton('Getting the scheduling options ready...') })
const CaptionPanel = dynamic(() => import('./SocialPanels').then((m) => m.CaptionPanel), { ssr: false, loading: panelSkeleton('Getting the caption settings ready...') })

type TypeTile = { key: GraphicType; label: string; hint: string; textField: { label: string; hint: string } | null }
type Props = {
  scheduling: Scheduling
  api: string
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
 * The composer (wave C spec 3.5). One preview at a time: only the selected size is requested, and a size already loaded is kept for
 * the session. Share uses the phone's share sheet (Save Image goes to Photos) and falls back to a normal download everywhere else.
 */
export function SocialComposer({ api, types, defaultStyle, settings, filePrefix, initial, scheduling }: Props) {
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
  const [tags, setTags] = useState<string[]>(scheduling.edit?.hashtags ?? settings.hashtags)
  const cache = useRef<Record<string, Preview>>({})
  // Editing a saved post keeps its caption the first time the standard one arrives.
  const keepCaption = useRef(Boolean(scheduling.edit))
  const tile = types.find((t) => t.key === type) ?? null
  const hydrated = useHydrated()

  const params = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ type, source, size, style, ...extra })
    if (text) q.set('text', text)
    return q
  }, [type, source, size, style, text])
  const key = `${type}|${source}|${style}|${size}|${text}`

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

  // Step 2: only the visible size, after a short pause, and never twice.
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
    if (!type || !source) { setCaption(''); return }
    let live = true
    const q = new URLSearchParams({ type, source })
    if (text) q.set('text', text)
    fetch(`${api}/caption?${q}`, { credentials: 'include' })
      .then(async (r) => (r.ok ? ((await r.json()) as { text: string; unknown: string[]; alt: string }) : null))
      .then((j) => {
        if (!live) return
        if (keepCaption.current) {
          setCaption(scheduling.edit?.caption ?? '')
          keepCaption.current = false
        } else setCaption(j?.text ?? '')
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

  const preview = previews[key]
  const filename = `${filePrefix}-${type}-${size}.png`
  const fullCaption = useMemo(() => composeCopyText({ body: caption, signOff: settings.signOff, hashtags: tags }), [caption, settings.signOff, tags])

  const pick = (t: GraphicType) => { keepCaption.current = false; setType(t); setSource(''); setGame(''); setText('') }
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
    <div className="club-stack social" aria-busy={!hydrated}>
      <section aria-labelledby="social-step-1" className="club-panel">
        <h2 id="social-step-1" className="club-field__title">1. What do you want to post?</h2>
        <div className="social__tiles" role="group" aria-label="Kinds of picture">
          {types.map((t) => (
            <button key={t.key} type="button" className="social__tile" aria-pressed={t.key === type} disabled={!hydrated} onClick={() => pick(t.key)}>
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
                    <span>{c.label}{c.note && <small className="club-muted">{` ${c.note}`}</small>}</span>
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
        <>
        <section aria-labelledby="social-step-3" className="club-panel">
          <h2 id="social-step-3" className="club-field__title">3. Use it</h2>
          <div className="club-actions">
            <button type="button" className="social__button social__button--primary" onClick={share} disabled={!hydrated || preview?.state !== 'ready'}>Share or save to Photos</button>
            <button type="button" className="social__button" onClick={download} disabled={!hydrated || preview?.state !== 'ready'}>Download picture (PNG)</button>
          </div>
          <label className="social__field">
            <span className="club-field__title">Caption</span>
            <textarea rows={7} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <span className="club-muted">Copying adds your sign-off and hashtags from the settings below.</span>
          </label>
          {warn.length > 0 && <p role="status" className="club-muted">These words in the caption wording were not recognised and are left as they are: {warn.map((w) => `{${w}}`).join(', ')}.</p>}
          {settings.hashtags.length > 0 && (
            <fieldset className="social__chips">
              <legend className="club-field__title">Hashtags for this post</legend>
              {settings.hashtags.map((h) => (
                <label key={h} className="social__choice">
                  <input type="checkbox" checked={tags.includes(h)} onChange={(e) => setTags(e.target.checked ? [...tags, h] : tags.filter((x) => x !== h))} />
                  <span>#{h}</span>
                </label>
              ))}
            </fieldset>
          )}
          <button type="button" className="social__button" onClick={copy} disabled={!caption}>Copy caption</button>
          <p role="status" aria-live="polite" className="club-muted">{announce}</p>
        </section>

        <SchedulePanel
          scheduling={scheduling}
          signOff={settings.signOff}
          tags={tags}
          caption={caption}
          spec={{ type, source, text, style }}
        />
        </>
      )}

      <CaptionPanel type={type} settings={settings} />
    </div>
  )
}
