import { ImageResponse } from 'next/og'
import { createElement } from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { FONT_WIDTHS } from '@/lib/social/font-widths'
import { fitText, textWidth } from '@/lib/social/text-fit'
import { FONT_MENU, OG_BODY_FACES } from '@/lib/theme/fonts'

/** The width tables are validated, not trusted: real satori renders of a fixed sample set must not exceed the estimate, and the estimate must stay within 5 percent of them (it leans high on purpose). */
const SAMPLES = ['Harbour Hardware', 'Northern Districts Cricket Club', 'The quick brown fox jumps over the lazy dog', 'Alexander Montgomery-Featherstonehaugh', 'Round 14 results', '182/6 (40.0 ov)', 'WWW iii mmm lll']
const faces = [
  ...Object.entries(FONT_MENU).map(([key, m]) => { const f = m.faces.find((x) => x.weight === m.ogWeight)!; return { key, ttf: f.ttf, weight: f.weight } }),
  ...OG_BODY_FACES.map((f) => ({ key: `inter-${f.weight}`, ttf: f.ttf, weight: f.weight })),
]
const PX = 60

async function inkWidth(data: ArrayBuffer, weight: 400 | 500 | 600 | 700, text: string): Promise<number> {
  const el = createElement('div', { style: { display: 'flex', width: 3000, height: 120, background: '#fff', color: '#000', fontFamily: 'F', fontSize: PX, whiteSpace: 'pre', alignItems: 'center' } }, text)
  const png = Buffer.from(await new ImageResponse(el, { width: 3000, height: 120, fonts: [{ name: 'F', data, weight, style: 'normal' }] }).arrayBuffer())
  const { data: px, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true })
  let min = info.width, max = 0
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (px[y * info.width + x] < 128) { min = Math.min(min, x); max = Math.max(max, x) }
  return max - min + 1
}

describe('font width tables', () => {
  it('has a table for every bundled display and body face', () => {
    for (const f of faces) expect(FONT_WIDTHS[f.key]?.length, f.key).toBe(95)
  })
  for (const f of faces) {
    it(`${f.key}: the estimate is never below the real render and within 5 percent`, async () => {
      const buf = readFileSync(path.resolve(f.ttf))
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
      for (const s of SAMPLES) {
        const real = await inkWidth(data, f.weight, s)
        const est = textWidth(s, PX, f.key)
        expect(est, `${f.key} "${s}" estimate ${est} vs real ${real}`).toBeGreaterThanOrEqual(real)
        expect(est / real, `${f.key} "${s}" estimate ${est} vs real ${real}`).toBeLessThanOrEqual(1.05 + 0.0)
      }
    }, 30_000)
  }
})

describe('fitText', () => {
  it('keeps short text on one line at the full size', () => {
    expect(fitText('Rivals United', 800, 40, 24, 2)).toMatchObject({ size: 40, lines: ['Rivals United'], truncated: false })
  })
  it('shrinks a little before wrapping, and wraps to two lines before it truncates', () => {
    const r = fitText('Northern Districts Cricket Club Juniors', 420, 40, 24, 2)
    expect(r.truncated).toBe(false)
    expect(r.lines.length).toBeLessThanOrEqual(2)
    expect(r.size).toBeGreaterThanOrEqual(24)
    for (const l of r.lines) expect(textWidth(l, r.size)).toBeLessThanOrEqual(420)
  })
  it('truncates at a word, with an ellipsis, only at the minimum size', () => {
    const r = fitText('Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliet Kilo', 200, 40, 24, 2)
    expect(r.truncated).toBe(true)
    expect(r.size).toBe(24)
    expect(r.lines.join(' ')).toMatch(/…$/)
  })
  it('never splits inside a word unless one word alone is wider than the box', () => {
    const r = fitText('Supercalifragilisticexpialidocious', 160, 30, 20, 1)
    expect(r.truncated).toBe(true)
    expect(r.lines).toHaveLength(1)
  })
})
