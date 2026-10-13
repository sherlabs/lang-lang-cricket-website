import { isTab, type Tab } from './queue-view'
import { isGraphicType, isSizeKey, isStyleKey, type GraphicType, type SizeKey, type StyleKey } from './types'

/**
 * The Social composer keeps its choice in the address (`?type=&source=&style=&size=&text=`). The address is user-controlled and its
 * values flow into API calls, so every value is validated here before use and anything invalid falls back to "not set". Pure; used
 * by the composer after mount (it never reads `window.location` while rendering, so the first paint is the same on server and client).
 */
export const SOURCE_MAX_IDS = 4
export const SOURCE_ID_MAX = 100
export const SOURCE_MAX = 160
export const TEXT_MAX = 80

export type ComposerUrl = {
  type: GraphicType | ''
  source: string
  style: StyleKey | null
  size: SizeKey | null
  text: string
  tab: Tab | null
  post: number | null
}

const SOURCE_ID = /^[A-Za-z0-9_|.:-]+$/

/** At most four comma-separated ids, each a short run of letters, digits and `_ | . : -`. Anything else is dropped. */
export function cleanSource(raw: string | null | undefined): string {
  const ids = (raw ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= SOURCE_ID_MAX && SOURCE_ID.test(s))
  const out = [...new Set(ids)].slice(0, SOURCE_MAX_IDS).join(',')
  return out.length <= SOURCE_MAX ? out : ''
}

/** Control characters removed, at most `TEXT_MAX` characters. */
export function cleanText(raw: string | null | undefined): string {
  return [...(raw ?? '')].filter((c) => { const n = c.charCodeAt(0); return n > 31 && n !== 127 }).join('').slice(0, TEXT_MAX)
}

export function parseComposerUrl(search: string): ComposerUrl {
  const q = new URLSearchParams(search)
  const type = q.get('type')
  const style = q.get('style')
  const size = q.get('size')
  const tab = q.get('tab')
  const post = Number(q.get('post'))
  const known = isGraphicType(type)
  return {
    type: known ? type : '',
    source: known ? cleanSource(q.get('source')) : '',
    style: isStyleKey(style) ? style : null,
    size: isSizeKey(size) ? size : null,
    text: known ? cleanText(q.get('text')) : '',
    tab: isTab(tab) ? tab : null,
    post: Number.isInteger(post) && post > 0 ? post : null,
  }
}

/** Ids that are not in the loaded list are dropped (only for values that came from the address). Empty list means keep nothing. */
export function dropUnknownSources(source: string, known: ReadonlySet<string>): string {
  return source.split(',').filter((id) => id !== '' && known.has(id)).join(',')
}

/**
 * The query string for the current choice, starting from the existing one so keys the composer does not own (`tab`, `post`, anything
 * else) survive. Returns the new search string ('' or '?a=b'); the caller rewrites the address only when it differs from the old one.
 */
export function composerSearch(current: string, state: { type: GraphicType | ''; source: string; style: StyleKey; size: SizeKey; text: string; post: number | null }): string {
  const q = new URLSearchParams(current)
  const set = (key: string, value: string) => { if (value) q.set(key, value); else q.delete(key) }
  set('type', state.type)
  set('source', state.source)
  set('style', state.source ? state.style : '')
  set('size', state.source ? state.size : '')
  set('text', state.text)
  if (state.post !== null) q.set('post', String(state.post))
  const text = q.toString()
  return text ? `?${text}` : ''
}
