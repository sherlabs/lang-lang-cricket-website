import { ImageResponse } from 'next/og'
import { describe, expect, it } from 'vitest'
import { renderGraphic } from '@/lib/social/render'
import { SPECS } from '@/lib/social/specs'
import { SIZE_KEYS, SIZES, STYLE_KEYS, TYPE_KEYS } from '@/lib/social/types'
import { loadThemeFonts } from '@/lib/theme/fonts-server'
import { resolveTheme } from '@/lib/theme/resolve'
import { FIXTURE_DATA, TINY_PNG } from './helpers/social-fixtures'

const theme = resolveTheme(null)

/** 10 types x 3 sizes x 3 styles = 90 real renders; each is checked for its PNG dimensions (the IHDR chunk). */
describe('social graphics render', () => {
  it('renders every type in every size and style to a PNG of the stated size', async () => {
    const fonts = await loadThemeFonts(theme)
    const started = Date.now()
    let count = 0
    for (const type of TYPE_KEYS) {
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const layout = SPECS[type].layout(FIXTURE_DATA[type], style, size)
          const el = renderGraphic({ layout, style, size, theme, crestDataUri: TINY_PNG, clubName: 'Test Club', siteHost: 'example.org', attribution: '', strip: [{ src: TINY_PNG, name: 'S' }] })
          const buf = Buffer.from(await new ImageResponse(el, { ...SIZES[size], fonts }).arrayBuffer())
          expect(buf.subarray(1, 4).toString(), `${type} ${size} ${style}`).toBe('PNG')
          expect([buf.readUInt32BE(16), buf.readUInt32BE(20)], `${type} ${size} ${style}`).toEqual([SIZES[size].width, SIZES[size].height])
          count++
        }
      }
    }
    expect(count).toBe(90)
    expect(Date.now() - started).toBeLessThan(60_000)
  }, 90_000)
})
