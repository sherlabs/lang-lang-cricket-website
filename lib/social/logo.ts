import 'server-only'
import { readFile } from 'node:fs/promises'
import { allowedImageHosts } from '@/lib/theme/og'
import { logoFromBytes, LogoCache, MAX_INPUT_BYTES, storedFilePath, type LogoResult } from './logo-core'

/**
 * Sponsor logos for the pictures (wave G spec WP-2b). `loadLogoDataUri` reads the stored upload without an HTTP request to ourselves
 * where the file is on disk (development and test), and from the storage host only (never a redirect, 5 second timeout, size capped)
 * on a deployment, then hands the bytes to `logoFromBytes`. Results are cached on `id + updatedAt`.
 */
export type LogoMedia = { id: number | string; updatedAt?: string | null; filename?: string | null; url?: string | null }

const FETCH_TIMEOUT_MS = 5000
export const logoCache = new LogoCache()

async function fetchCapped(url: string): Promise<Buffer | 'too_large' | null> {
  const abs = new URL(url)
  if (abs.protocol !== 'https:' || !allowedImageHosts().includes(abs.host)) return null
  const res = await fetch(abs, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), redirect: 'error', cache: 'no-store' })
  if (!res.ok) return null
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_INPUT_BYTES) return 'too_large'
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.length > MAX_INPUT_BYTES ? 'too_large' : buf
}

async function readBytes(media: LogoMedia, staticDir: string): Promise<Buffer | 'too_large' | null> {
  const file = media.filename ? storedFilePath(staticDir, media.filename) : null
  if (file) {
    try {
      const buf = await readFile(file)
      return buf.length > MAX_INPUT_BYTES ? 'too_large' : buf
    } catch {
      /* not on disk: fall through to the storage host */
    }
  }
  if (media.url && /^https:/i.test(media.url)) {
    try {
      return await fetchCapped(media.url)
    } catch {
      return null
    }
  }
  return null
}

export async function loadLogoDataUri(media: LogoMedia, opts: { staticDir: string }): Promise<LogoResult> {
  const key = `${media.id}|${media.updatedAt ?? ''}`
  const hit = logoCache.get(key)
  if (hit) return hit
  const bytes = await readBytes(media, opts.staticDir)
  const result: LogoResult = bytes === 'too_large' ? { error: 'too_large' } : bytes === null ? { error: 'missing' } : await logoFromBytes(bytes)
  logoCache.set(key, result)
  return result
}
