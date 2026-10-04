import 'server-only'
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ReactElement } from 'react'
import { BRANDING } from '@/config/site'
import { getTheme } from '@/lib/theme'
import { isDrawableImageType } from '@/lib/stats/card'
import { loadThemeFonts } from './fonts-server'
import type { ResolvedTheme } from './resolve'

/** Neutral constants for text on a dark card. Not theme values (no `ResolvedTheme.white`). */
export const WHITE = '#ffffff'
export const WHITE_75 = '#ffffffbf'

const LOGO_TIMEOUT_MS = 2000
const CREST_TTL_MS = 10 * 60 * 1000
let crestCache: { key: string; at: number; value: string | null } | null = null

const asDataUri = (buf: Buffer, type: string) => `data:${type};base64,${buf.toString('base64')}`

async function loadCrestUncached(crestUrl: string): Promise<string | null> {
  try {
    if (/^https?:\/\//i.test(crestUrl)) {
      const res = await fetch(crestUrl, { signal: AbortSignal.timeout(LOGO_TIMEOUT_MS) })
      const type = res.headers.get('content-type')
      if (res.ok && isDrawableImageType(type)) return asDataUri(Buffer.from(await res.arrayBuffer()), type!.split(';')[0])
    } else if (/\.(png|jpe?g)$/i.test(crestUrl)) {
      const publicDir = path.join(process.cwd(), 'public')
      const file = path.join(publicDir, crestUrl.replace(/^\/+/, ''))
      if (file.startsWith(publicDir)) return asDataUri(await readFile(file), /\.png$/i.test(file) ? 'image/png' : 'image/jpeg')
    }
  } catch {
    // fall through to the bundled crest
  }
  try {
    return asDataUri(await readFile(path.join(process.cwd(), 'public', BRANDING.logo)), 'image/png')
  } catch {
    return null
  }
}

/** The crest as a data URI satori can draw (PNG/JPEG): the themed crest, else the bundled PNG, else null. Cached 10 minutes. */
export async function loadCrest(crestUrl: string): Promise<string | null> {
  if (crestCache && crestCache.key === crestUrl && Date.now() - crestCache.at < CREST_TTL_MS) return crestCache.value
  const value = await loadCrestUncached(crestUrl)
  crestCache = { key: crestUrl, at: Date.now(), value }
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
  const [fonts, crestDataUri] = await Promise.all([loadThemeFonts(theme), loadCrest(theme.crest.url)])
  return new ImageResponse(render({ theme, crestDataUri }), { width: opts.width, height: opts.height, headers: opts.headers, fonts })
}
