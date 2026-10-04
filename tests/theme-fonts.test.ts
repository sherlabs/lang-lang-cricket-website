import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT, FONT_MENU, OG_BODY_FACES, OG_BODY_LICENCE } from '../lib/theme/fonts'
import { FONT_KEYS } from '../lib/theme/tokens'

const root = path.resolve(__dirname, '..')
const abs = (rel: string) => path.join(root, rel)

/** Table directory of a TrueType file: the four-character tags. */
function tables(file: string): string[] {
  const b = readFileSync(file)
  const n = b.readUInt16BE(4)
  return Array.from({ length: n }, (_, i) => b.toString('latin1', 12 + i * 16, 16 + i * 16))
}

describe('font manifest', () => {
  it('menu keys equal FONT_KEYS and the default is in the menu', () => {
    expect(Object.keys(FONT_MENU).sort()).toEqual([...FONT_KEYS].sort())
    expect(FONT_MENU[DEFAULT_FONT]).toBeTruthy()
  })

  const ttfs = [...Object.values(FONT_MENU).flatMap((m) => m.faces.map((f) => f.ttf)), ...OG_BODY_FACES.map((f) => f.ttf)]
  it.each(ttfs)('%s exists, is a static TrueType font (no fvar)', (rel) => {
    expect(existsSync(abs(rel))).toBe(true)
    const head = readFileSync(abs(rel)).subarray(0, 4)
    expect(head.equals(Buffer.from([0, 1, 0, 0])) || head.toString('latin1') === 'OTTO').toBe(true)
    expect(tables(abs(rel))).not.toContain('fvar')
  })

  it('every web face is a woff2 file and the OG weight exists', () => {
    for (const m of Object.values(FONT_MENU)) {
      for (const f of m.faces) expect(readFileSync(abs(f.woff2)).toString('latin1', 0, 4)).toBe('wOF2')
      expect(m.faces.map((f) => f.weight)).toContain(m.ogWeight)
    }
  })

  it('every licence file exists and is the OFL', () => {
    for (const rel of [...Object.values(FONT_MENU).map((m) => m.licence), OG_BODY_LICENCE]) {
      expect(readFileSync(abs(rel), 'utf8')).toMatch(/SIL OPEN FONT LICENSE/i)
    }
  })

  it('bundled fonts stay under the 2 MB budget', () => {
    const files = new Set([...ttfs, ...Object.values(FONT_MENU).flatMap((m) => m.faces.map((f) => f.woff2))])
    const total = [...files].reduce((n, rel) => n + statSync(abs(rel)).size, 0)
    expect(total).toBeLessThan(2 * 1024 * 1024)
  })

  it('font-faces.ts declares exactly the manifest faces (the next/font literals cannot drift)', () => {
    const src = readFileSync(abs('lib/theme/font-faces.ts'), 'utf8')
    for (const k of FONT_KEYS) expect(src).toContain(`variable: '--font-h-${k}'`)
    for (const m of Object.values(FONT_MENU)) for (const f of m.faces) expect(src).toContain(`../../${f.woff2}`)
    expect(src.match(/path: '/g)?.length).toBe(Object.values(FONT_MENU).reduce((n, m) => n + m.faces.length, 0))
  })
})
