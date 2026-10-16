import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FONT_MENU, OG_BODY_FACES } from './fonts'
import type { ResolvedTheme } from './resolve'

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: 'normal' }

const cache = new Map<string, Promise<ArrayBuffer>>()

/** Read a bundled font once per process. Files must be listed in `outputFileTracingIncludes` (`./assets/fonts/**`). */
function load(rel: string): Promise<ArrayBuffer> {
  let p = cache.get(rel)
  if (!p) {
    p = readFile(path.join(process.cwd(), rel)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
    // A failed read must not be cached forever.
    p.catch(() => cache.delete(rel))
    cache.set(rel, p)
  }
  return p
}

/**
 * Fonts for satori (next/og): `Display` is the theme's heading face at its OG weight, `Body` is bundled
 * Inter 400 and 700. Use `fontFamily: 'Display'` for names and numbers and `'Body'` for labels.
 */
export async function loadThemeFonts(theme: Pick<ResolvedTheme, 'font'>): Promise<OgFont[]> {
  const menu = FONT_MENU[theme.font.key]
  const face = menu.faces.find((f) => f.weight === menu.ogWeight) ?? menu.faces[menu.faces.length - 1]
  const [display, ...body] = await Promise.all([load(face.ttf), ...OG_BODY_FACES.map((f) => load(f.ttf))])
  return [
    { name: 'Display', data: display, weight: face.weight, style: 'normal' },
    ...OG_BODY_FACES.map((f, i) => ({ name: 'Body', data: body[i], weight: f.weight, style: 'normal' as const })),
  ]
}
