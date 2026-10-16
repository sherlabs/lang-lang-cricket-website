// Dev tool (admin-only, mocked data, no network): renders every layout case in every style and size into a folder as PNGs plus an
// HTML contact sheet. `pnpm tsx scripts/render-social-gallery.ts <outDir> [caseIdPrefix]`
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { renderGraphic } from '../lib/social/render'
import { SPECS } from '../lib/social/specs'
import { SIZE_KEYS, SIZES, STYLE_KEYS } from '../lib/social/types'
import { loadThemeFonts } from '../lib/theme/fonts-server'
import { resolveTheme } from '../lib/theme/resolve'
import { LAYOUT_CASES } from '../tests/helpers/layout-metrics'
import { FIXTURE_DATA, TINY_PNG } from '../tests/helpers/social-fixtures'
import { TYPE_KEYS } from '../lib/social/types'

const out = path.resolve(process.argv[2] ?? 'gallery')
const only = process.argv[3]
mkdirSync(out, { recursive: true })
const theme = resolveTheme(null)
const fonts = await loadThemeFonts(theme)
const cells: string[] = []
const all = [...LAYOUT_CASES, ...TYPE_KEYS.map((type) => ({ id: `fixture:${type}`, type, data: () => FIXTURE_DATA[type] }))]
for (const c of all.filter((x) => !only || x.id.startsWith(only))) {
  const data = await c.data()
  const files: Record<string, Buffer> = {}
  for (const size of SIZE_KEYS) {
    for (const style of STYLE_KEYS) {
      const layout = SPECS[c.type].layout(data as never, style, size)
      const strip = c.type === 'sponsor-thanks' ? [] : [{ src: TINY_PNG, name: 'S' }]
      const el = renderGraphic({ layout, style, size, theme, crestDataUri: TINY_PNG, clubName: 'Test Club', siteHost: 'example.org', attribution: '', strip })
      const file = `${c.id.replace(':', '-')}_${size}_${style}.png`
      const png = Buffer.from(await new ImageResponse(el, { ...SIZES[size], fonts }).arrayBuffer())
      writeFileSync(path.join(out, file), png)
      files[`${size}|${style}`] = png
      cells.push(`<figure><img src="${file}" height="${size === 'story' ? 360 : 220}"><figcaption>${c.id} ${size} ${style}</figcaption></figure>`)
    }
  }
  // One sheet per case: a row per style, a column per size, each at a common height, for a quick look at all nine.
  const H = 300
  const tiles = await Promise.all(STYLE_KEYS.flatMap((style, r) => SIZE_KEYS.map(async (size, k) => ({ input: await sharp(files[`${size}|${style}`]).resize({ height: H }).png().toBuffer(), top: r * (H + 8), left: 0, k, size }))))
  const widths = SIZE_KEYS.map((size) => Math.round((SIZES[size].width / SIZES[size].height) * H))
  const lefts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b + 8, 0))
  await sharp({ create: { width: widths.reduce((a, b) => a + b + 8, 0), height: STYLE_KEYS.length * (H + 8), channels: 3, background: '#888' } })
    .composite(tiles.map((t) => ({ input: t.input, top: t.top, left: lefts[t.k] })))
    .png()
    .toFile(path.join(out, `sheet-${c.id.replace(':', '-')}.png`))
}
writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset=utf-8><body style="font:12px sans-serif;display:flex;flex-wrap:wrap;gap:8px">${cells.join('')}`)
console.log(`wrote ${cells.length} images to ${out}`)
