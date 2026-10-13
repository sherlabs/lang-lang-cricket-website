import path from 'node:path'
import sharp from 'sharp'

/**
 * The pure half of the sponsor logo pipeline (wave G spec WP-2b): bytes in, a PNG data URI out. No file or network access here, so it
 * is tested with generated fixtures. The type is decided from the bytes (never the stored label), decoding is bounded, and an SVG is
 * rejected, not sanitised, when it could reach outside itself.
 */
export type LogoError = 'unsupported' | 'missing' | 'too_large' | 'unreadable'
export type LogoOk = { dataUri: string; width: number; height: number }
export type LogoResult = LogoOk | { error: LogoError }

export const MAX_INPUT_BYTES = 5 * 1024 * 1024
export const MAX_INPUT_PIXELS = 25_000_000
export const MAX_EDGE = 1024

/** A plain-English reason for the composer, one per failure. */
export const LOGO_ERROR_TEXT: Record<LogoError, string> = {
  unsupported: 'this logo file type cannot be drawn',
  missing: 'the logo file could not be found',
  too_large: 'the logo file is too large',
  unreadable: 'the logo file could not be read',
}

/**
 * True when the SVG text stays inside itself: no `<image>`, scripts, foreign objects, entities or internal DTD subset, and every
 * `href` or `url(...)` is a same-document fragment (`#id`). Anything else is refused.
 */
export function svgIsSelfContained(text: string): boolean {
  const t = text.toLowerCase()
  if (/<\s*(image|script|foreignobject|iframe|embed|object|link|audio|video)\b/.test(t)) return false
  if (t.includes('<!entity') || t.includes('<?xml-stylesheet') || t.includes('@import')) return false
  if (/<!doctype[^[>]*\[/.test(t)) return false
  for (const m of t.matchAll(/(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) if (!(m[1] ?? m[2] ?? '').trim().startsWith('#')) return false
  for (const m of t.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) if (!(m[1] ?? m[2] ?? m[3] ?? '').trim().startsWith('#')) return false
  return true
}

const FORMATS = new Set(['png', 'jpeg', 'webp', 'gif', 'svg'])

/** Decode `buf` (any of PNG, JPEG, WebP, GIF, AVIF, SVG) to a PNG data URI at most `MAX_EDGE` on its long edge, padding trimmed. */
export async function logoFromBytes(buf: Buffer): Promise<LogoResult> {
  if (buf.length === 0) return { error: 'unreadable' }
  if (buf.length > MAX_INPUT_BYTES) return { error: 'too_large' }
  try {
    const open = (density?: number) => sharp(buf, { limitInputPixels: MAX_INPUT_PIXELS, animated: false, failOn: 'error', ...(density ? { density } : {}) })
    const meta = await open().metadata()
    const isAvif = meta.format === 'heif' && meta.compression === 'av1'
    if (!isAvif && !(meta.format && FORMATS.has(meta.format))) return { error: 'unsupported' }
    if (meta.format === 'svg' && !svgIsSelfContained(buf.toString('utf8'))) return { error: 'unsupported' }
    // An SVG is rasterised at 2x its nominal size, then fitted like the others.
    let img = open(meta.format === 'svg' ? 192 : undefined).resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: meta.format !== 'svg' })
    img = img.ensureAlpha()
    let png = await img.png().toBuffer()
    try {
      const trimmed = await sharp(png).trim({ threshold: 8 }).png().toBuffer()
      const tm = await sharp(trimmed).metadata()
      if ((tm.width ?? 0) >= 8 && (tm.height ?? 0) >= 8) png = trimmed
    } catch {
      /* a uniform picture cannot be trimmed: keep it whole */
    }
    const out = await sharp(png).metadata()
    return { dataUri: `data:image/png;base64,${png.toString('base64')}`, width: out.width ?? 0, height: out.height ?? 0 }
  } catch (err) {
    return { error: /pixel limit/i.test(err instanceof Error ? err.message : '') ? 'too_large' : 'unreadable' }
  }
}

type Entry = { value: LogoResult; size: number; at: number }

/** A bounded LRU keyed by `id + updatedAt`: successes up to `maxEntries` and `maxBytes` of data URI, failures only for `failTtlMs`. */
export class LogoCache {
  private map = new Map<string, Entry>()
  private bytes = 0
  constructor(private maxEntries = 64, private maxBytes = 16 * 1024 * 1024, private failTtlMs = 60_000, private now: () => number = Date.now) {}
  get size(): number { return this.map.size }
  get totalBytes(): number { return this.bytes }
  get(key: string): LogoResult | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    if ('error' in e.value && this.now() - e.at > this.failTtlMs) { this.delete(key); return undefined }
    this.map.delete(key)
    this.map.set(key, e)
    return e.value
  }
  set(key: string, value: LogoResult): void {
    this.delete(key)
    const size = 'dataUri' in value ? value.dataUri.length : 0
    if (size > this.maxBytes) return
    this.map.set(key, { value, size, at: this.now() })
    this.bytes += size
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.map.keys().next().value as string
      this.delete(oldest)
    }
  }
  private delete(key: string): void {
    const e = this.map.get(key)
    if (e) { this.bytes -= e.size; this.map.delete(key) }
  }
}

/** The file under the media upload directory, or null for a name that would leave it. */
export function storedFilePath(staticDir: string, filename: string): string | null {
  const base = path.basename(filename)
  if (!base || base !== filename) return null
  const root = path.resolve(staticDir)
  const file = path.resolve(root, base)
  return file.startsWith(root + path.sep) ? file : null
}

