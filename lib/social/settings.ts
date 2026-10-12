import { DEFAULT_CAPTIONS } from './caption'
import { DEFAULT_WINDOW, resolveWindow, type PublishWindow } from './schedule-time'
import { isStyleKey, TYPE_KEYS, type GraphicType, type StyleKey } from './types'

/**
 * The social-settings global as the code uses it (wave C spec 3.3). Pure: `resolveSocialSettings` turns whatever the database
 * holds (nothing, a partial row, bad values) into a complete, safe object, so a graphic always renders.
 */
export type SocialSettings = {
  defaultStyle: StyleKey
  sponsorStrip: { show: boolean; tiers: string[]; max: number }
  showSiteHost: boolean
  attribution: string
  /** Stored without the `#`. */
  hashtags: string[]
  captionTemplates: Record<GraphicType, string>
  signOff: string
  /** Quiet hours in club time (wave C spec 4.2). */
  publishWindow: PublishWindow
}

export const HASHTAG_MAX = 30
export const TEMPLATE_MAX = 600
export const ATTRIBUTION_MAX = 80
export const SPONSOR_STRIP_MAX = { min: 3, max: 8, default: 5 } as const
export const DEFAULT_STRIP_TIERS = ['Platinum', 'Gold'] as const

export const DEFAULT_SOCIAL_SETTINGS: SocialSettings = {
  defaultStyle: 'bold',
  sponsorStrip: { show: true, tiers: [...DEFAULT_STRIP_TIERS], max: SPONSOR_STRIP_MAX.default },
  showSiteHost: true,
  attribution: '',
  hashtags: [],
  captionTemplates: { ...DEFAULT_CAPTIONS },
  signOff: '',
  publishWindow: { ...DEFAULT_WINDOW },
}

/** A tag is letters, digits and underscores only, so it cannot carry a mention or a link. */
export const isHashtag = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(v)

export function validateHashtag(value: unknown): true | string {
  return isHashtag(typeof value === 'string' ? value.replace(/^#/, '') : value) ? true : 'Use letters, numbers and underscores only, up to 40 characters, without the #.'
}

export const validateTemplate = (value: unknown): true | string =>
  value == null || (typeof value === 'string' && value.length <= TEMPLATE_MAX) ? true : `Keep it to ${TEMPLATE_MAX} characters or fewer.`

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '')
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function resolveSocialSettings(doc: unknown): SocialSettings {
  const d = isObj(doc) ? doc : {}
  const strip = isObj(d.sponsorStrip) ? d.sponsorStrip : {}
  const tiers = Array.isArray(strip.tiers) ? strip.tiers.filter((t): t is string => typeof t === 'string') : null
  const max = typeof strip.max === 'number' && Number.isFinite(strip.max) ? Math.round(strip.max) : SPONSOR_STRIP_MAX.default
  const templates = isObj(d.captionTemplates) ? d.captionTemplates : {}
  const captionTemplates = { ...DEFAULT_CAPTIONS }
  for (const type of TYPE_KEYS) {
    const key = type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    const v = templates[key]
    if (typeof v === 'string' && v.trim()) captionTemplates[type] = v.slice(0, TEMPLATE_MAX)
  }
  const tags = Array.isArray(d.hashtags)
    ? d.hashtags.map((h) => (isObj(h) ? String(h.tag ?? '') : String(h ?? '')).replace(/^#/, '').trim()).filter(isHashtag)
    : []
  return {
    defaultStyle: isStyleKey(d.defaultStyle) ? d.defaultStyle : DEFAULT_SOCIAL_SETTINGS.defaultStyle,
    sponsorStrip: {
      show: strip.show === undefined ? true : strip.show !== false,
      tiers: tiers ?? [...DEFAULT_STRIP_TIERS],
      max: Math.min(SPONSOR_STRIP_MAX.max, Math.max(SPONSOR_STRIP_MAX.min, max)),
    },
    showSiteHost: d.showSiteHost === undefined ? true : d.showSiteHost !== false,
    attribution: str(d.attribution, ATTRIBUTION_MAX),
    hashtags: [...new Set(tags)].slice(0, HASHTAG_MAX),
    captionTemplates,
    signOff: str(d.signOff, 200),
    publishWindow: resolveWindow(d.publishWindow),
  }
}

/** The key a graphic type has inside the `captionTemplates` group (`stats-leaders` becomes `statsLeaders`). */
export const templateKey = (type: GraphicType): string => type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

export type CaptionSettingsInput = { hashtags: string[]; signOff: string; captionTemplates: Partial<Record<GraphicType, string>> }
export type CaptionSettingsResult = { ok: true; value: { hashtags: { tag: string }[]; signOff: string; captionTemplates: Record<string, string> } } | { ok: false; error: string }

/**
 * Validates what the composer's "Captions and hashtags" panel sends (the three editor-writable fields). Pure: the same checks the
 * global's field validators make, so an editor gets a plain message instead of a form error, and nothing odd is ever written.
 */
export function validateCaptionSettings(input: unknown): CaptionSettingsResult {
  const i = isObj(input) ? input : {}
  const rawTags = Array.isArray(i.hashtags) ? i.hashtags : []
  const tags = rawTags.map((t) => String(t ?? '').replace(/^#/, '').trim()).filter(Boolean)
  if (tags.length > HASHTAG_MAX) return { ok: false, error: `Use ${HASHTAG_MAX} hashtags or fewer.` }
  const bad = tags.find((t) => !/^[A-Za-z0-9_]{1,40}$/.test(t))
  if (bad) return { ok: false, error: `"${bad.slice(0, 40)}" is not a usable hashtag. Use letters, numbers and underscores only, up to 40 characters.` }
  const signOff = typeof i.signOff === 'string' ? i.signOff.trim() : ''
  if (signOff.length > 200) return { ok: false, error: 'Keep the sign-off to 200 characters or fewer.' }
  const templates: Record<string, string> = {}
  const given = isObj(i.captionTemplates) ? i.captionTemplates : {}
  for (const type of TYPE_KEYS) {
    const v = given[type]
    if (v === undefined) continue
    if (typeof v !== 'string' || v.length > TEMPLATE_MAX) return { ok: false, error: `Keep each caption to ${TEMPLATE_MAX} characters or fewer.` }
    templates[templateKey(type)] = v
  }
  return { ok: true, value: { hashtags: [...new Set(tags)].map((tag) => ({ tag })), signOff, captionTemplates: templates } }
}
