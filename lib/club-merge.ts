/**
 * Pure merge of the saved `club` global over the defaults module (spec §4.1). Kept free of
 * Payload/Next imports so it is unit-testable; `getClub()` (lib/club.ts) fetches and calls it.
 */
import { isHttpUrlOrEmpty } from '@/payload/fields/validators'
import { clubDefaults, DEFAULT_APPAREL_LABEL, type ClubDefaults } from '@/payload/seed/club-defaults'

type MediaLike = { url?: string | null; width?: number | null; height?: number | null } | number | null | undefined

/** The club's merchandise shop link (global `club-apparel`). */
export type Apparel = { url: string; label: string; blurb: string }

/**
 * `findGlobal('club-apparel')` -> the link to show, or null. Null (so NOTHING renders: no dead
 * button) when the URL is empty or is not http(s), even if something odd was stored.
 */
export function resolveApparel(doc: Record<string, unknown> | null | undefined): Apparel | null {
  const url = typeof doc?.apparelUrl === 'string' ? doc.apparelUrl.trim() : ''
  if (!url || !isHttpUrlOrEmpty(url)) return null
  const label = typeof doc?.apparelLabel === 'string' ? doc.apparelLabel.trim() : ''
  const blurb = typeof doc?.apparelBlurb === 'string' ? doc.apparelBlurb.trim() : ''
  return { url, label: label || DEFAULT_APPAREL_LABEL, blurb }
}

export type ResolvedClub = ClubDefaults & {
  /** Merchandise shop link, or null when none is set. */
  apparel: Apparel | null
  /** `club.logo` URL, or the static crest. */
  logoUrl: string
  /** `club.ogImage`, or the static 1200×630 image. */
  ogImage: { url: string; width?: number; height?: number }
  /** Non-empty social URLs (JSON-LD `sameAs`). */
  sameAs: string[]
  /** `siteUrl` without a trailing slash. */
  siteUrl: string
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Deep-merge `over` onto `base`: `null`/`undefined` keep the default; objects merge key by
 * key; arrays and scalars (including `''`) replace. Only keys present in `base` are taken,
 * so Payload bookkeeping (`id`, `globalType`, timestamps) never leaks into the result.
 */
export function mergeOver<T>(base: T, over: unknown): T {
  if (over === null || over === undefined) return base
  if (isPlainObject(base)) {
    if (!isPlainObject(over)) return base
    const out: Record<string, unknown> = { ...base }
    for (const key of Object.keys(base)) out[key] = mergeOver((base as Record<string, unknown>)[key], over[key])
    return out as T
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(over)) return base
    // Payload array rows carry an `id`; strip it so rows match the defaults' shape.
    return over.map((row) => (isPlainObject(row) ? Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'id')) : row)) as T
  }
  return typeof over === typeof base ? (over as T) : base
}

const mediaUrl = (m: MediaLike): string | null => (m && typeof m === 'object' && m.url ? m.url : null)

/**
 * The public site URL. An explicit `CANONICAL_HOST` env wins (it is required in production and already drives the
 * redirects), so a club that sets it can never publish canonicals, sitemap entries or structured data pointing at the
 * seeded domain. With no env (local dev) the Club details value is used.
 */
export function siteUrlFor(canonicalHost: string | undefined, fromClub: string): string {
  const host = canonicalHost?.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')
  return host ? `https://${host}` : fromClub.replace(/\/+$/, '')
}

/**
 * `doc` is the `findGlobal('club', depth 1)` result. A never-saved global (no `updatedAt`)
 * yields the defaults verbatim, so an unseeded site renders exactly as before.
 */
export function resolveClub(
  doc: Record<string, unknown> | null | undefined,
  defaults: ClubDefaults = clubDefaults,
  apparelDoc: Record<string, unknown> | null | undefined = null,
  canonicalHost: string | undefined = process.env.CANONICAL_HOST,
): ResolvedClub {
  const saved = Boolean(doc && doc.updatedAt)
  const merged = saved ? mergeOver(defaults, doc) : defaults
  const logo = saved ? (doc!.logo as MediaLike) : null
  const og = saved ? (doc!.ogImage as MediaLike) : null
  const ogUrl = mediaUrl(og)
  return {
    ...merged,
    apparel: resolveApparel(apparelDoc),
    siteUrl: siteUrlFor(canonicalHost, merged.siteUrl),
    logoUrl: mediaUrl(logo) ?? defaults.assets.logo,
    ogImage:
      ogUrl && og && typeof og === 'object'
        ? { url: ogUrl, width: og.width ?? undefined, height: og.height ?? undefined }
        : { ...defaults.assets.ogImage },
    sameAs: merged.socials.map((s) => s.url?.trim()).filter((u): u is string => Boolean(u)),
  }
}
