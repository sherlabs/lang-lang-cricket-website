import 'server-only'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ReactElement } from 'react'
import { BRANDING } from '@/config/site'
import { getTheme } from '@/lib/theme'
import { isDrawableImageType } from '@/lib/stats/card'
import { loadThemeFonts } from './fonts-server'
import { BLACK, WHITE } from './neutral'
import { blobStoreId } from '@/lib/blob-url'
import { blobToken, resolveServerURL } from '@/payload/env'
import type { ResolvedTheme } from './resolve'

/** Neutral constants for text on a dark card. Not theme values (no `ResolvedTheme.white`). */
export { WHITE, BLACK }
export const WHITE_75 = '#ffffffbf'

const LOGO_TIMEOUT_MS = 2000
let crestCache: { key: string; value: string | null } | null = null

const asDataUri = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString('base64')}`

async function loadCrestUncached(crestUrl: string): Promise<string | null> {
  try {
    if (/^https?:\/\//i.test(crestUrl)) {
      const res = await fetch(crestUrl, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) })
      const type = res.headers.get('content-type')
      if (res.ok && isDrawableImageType(type)) return asDataUri(Buffer.from(await res.arrayBuffer()), type!.split(';')[0])
      console.warn(`[og] crest ${crestUrl} is not a drawable PNG/JPEG (status ${res.status}, type ${type}); using the bundled crest`)
    } else if (/\.(png|jpe?g)$/i.test(crestUrl)) {
      const publicDir = path.join(process.cwd(), 'public')
      const file = path.join(publicDir, crestUrl.replace(/^\/+/, ''))
      if (file.startsWith(publicDir + path.sep)) return asDataUri(await readFile(file), /\.png$/i.test(file) ? 'image/png' : 'image/jpeg')
    }
  } catch (err) {
    console.warn(`[og] crest ${crestUrl} could not be loaded (${err instanceof Error ? err.message : err}); using the bundled crest`)
  }
  try {
    return asDataUri(await readFile(path.join(process.cwd(), 'public', BRANDING.logo)), 'image/png')
  } catch {
    return null
  }
}

/**
 * The crest as a data URI satori can draw (PNG/JPEG): the themed crest, else the bundled PNG, else null.
 * Cached per process, keyed on the URL and the theme `version` (the theme and crest `updatedAt`), so saving the
 * theme or re-uploading the crest (even at the same URL) shows the new crest on the next card.
 */
export async function loadCrest(crestUrl: string, version = ''): Promise<string | null> {
  const key = `${crestUrl}|${version}`
  if (crestCache && crestCache.key === key) return crestCache.value
  const value = await loadCrestUncached(crestUrl)
  crestCache = { key, value }
  return value
}

/**
 * The one way to build a branded OG image: resolves the theme, loads the fonts and the crest, and hands
 * them to `render`. Colours come only from `ctx.theme.colors`; `fontFamily: 'Display'` and `'Body'`.
 * Any route using it adds `./assets/fonts/**` to `outputFileTracingIncludes` in next.config.ts.
 */
export async function themedImageResponse(
  render: (ctx: { theme: ResolvedTheme; crestDataUri: string | null }) => ReactElement,
  opts: { width: number; height: number; headers?: Record<string, string> },
): Promise<ImageResponse> {
  const theme = await getTheme()
  const [fonts, crestDataUri] = await Promise.all([loadThemeFonts(theme), loadCrest(theme.crest.url, theme.version)])
  return new ImageResponse(render({ theme, crestDataUri }), { width: opts.width, height: opts.height, headers: opts.headers, fonts })
}

const imageCache = new Map<string, string | null>()
const IMAGE_CACHE_MAX = 200

/** The hosts an image URL may be fetched from: this site (media served by Payload) and this project's Blob store. Nothing else. */
export function allowedImageHosts(): string[] {
  const hosts: string[] = []
  try {
    hosts.push(new URL(resolveServerURL()).host)
  } catch {
    /* no server URL: only the store below */
  }
  const store = blobStoreId(blobToken())
  if (store) hosts.push(`${store}.public.blob.vercel-storage.com`)
  return hosts
}

/**
 * Any uploaded image (sponsor logo, event cover) as a data URI satori can draw, or null (never throws): PNG/JPEG only, a short timeout,
 * and only from `allowedImageHosts()` (redirects are refused, so a redirect cannot leave the allowed hosts). A relative URL is resolved against the site. Cached per process on `url + updatedAt`, so an
 * edited image refetches and an unchanged one does not; the fetch also goes through the Next data cache for cold serverless instances.
 */
export async function loadImageDataUri(url: string, updatedAt: string | number | Date | null = ''): Promise<string | null> {
  const key = `${url}|${updatedAt instanceof Date ? updatedAt.toISOString() : (updatedAt ?? '')}`
  if (imageCache.has(key)) return imageCache.get(key) ?? null
  let value: string | null = null
  try {
    const abs = new URL(url, resolveServerURL())
    if ((abs.protocol === 'https:' || abs.protocol === 'http:') && allowedImageHosts().includes(abs.host)) {
      const res = await fetch(abs, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS), redirect: 'error', next: { revalidate: 86400, tags: ['sponsor-logos'] } })
      const type = res.headers.get('content-type')
      if (res.ok && isDrawableImageType(type)) value = asDataUri(Buffer.from(await res.arrayBuffer()), type!.split(';')[0])
      else console.warn(`[og] image ${abs.pathname} is not a drawable PNG/JPEG (status ${res.status}); skipped`)
    }
  } catch (err) {
    console.warn(`[og] image could not be loaded (${err instanceof Error ? err.message : err}); skipped`)
  }
  if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.clear()
  imageCache.set(key, value)
  return value
}
