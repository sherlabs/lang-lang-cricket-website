import { describe, expect, it } from 'vitest'
import { cutRows } from '@/lib/social/density'
import { availableHeight, footerHeight, layoutHeight, logosFor } from '@/lib/social/fit'
import { SPECS } from '@/lib/social/specs'
import { joinNames } from '@/lib/social/specs/helpers'
import { SIZE_KEYS, STYLE_KEYS, type GraphicLayout, type SizeKey, type StyleKey } from '@/lib/social/types'
import { FIXTURE_DATA, TINY_PNG } from './helpers/social-fixtures'
import type { SeasonWrapData } from '@/lib/social/specs/season-wrap'
import type { SponsorThanksData } from '@/lib/social/specs/sponsor-thanks'
import type { FixturesData } from '@/lib/social/specs/fixtures'

/** The page space the layout has, with the footer it will really get (sponsor strip unless the layout drops it, plus the site line). */
const room = (layout: GraphicLayout, size: SizeKey, style: StyleKey) => availableHeight(size, style, footerHeight(size, { strip: !layout.noStrip, text: true }))
const fits = (layout: GraphicLayout, size: SizeKey, style: StyleKey) => {
  const avail = room(layout, size, style)
  return { used: layoutHeight(layout, size, style, avail), avail }
}

const sponsors = (n: number, tiers = ['Gold']): SponsorThanksData => ({
  sponsors: Array.from({ length: n }, (_, i) => ({ name: ['Bendigo Bank Lang Lang', 'Demo Hardware', 'Demo Fuel and Freight', 'Demo Cafe'][i], tier: tiers[i % tiers.length], logo: i === 2 ? null : TINY_PNG })),
  line: 'Thank you for backing the club this season.',
})

describe('graphic layouts fit the page', () => {
  // The estimate is conservative, so it is enforced for the types whose layouts were budgeted (the rest are tracked in the report).
  for (const type of ['fixtures', 'sponsor-thanks', 'season-wrap'] as const) {
    it(`${type}: every fixture fits in every size and style`, () => {
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const { used, avail } = fits(SPECS[type].layout(FIXTURE_DATA[type] as never, style, size), size, style)
          expect(used, `${type} ${size} ${style}: needs ${used}px of ${avail}px`).toBeLessThanOrEqual(avail)
        }
      }
    })
  }

  it('sponsor thank-you fits with one to four sponsors, with and without a message, in every size and style', () => {
    for (const n of [1, 2, 3, 4]) {
      for (const line of ['', 'Thank you for backing the club this season, we could not do it without every one of you.']) {
        for (const size of SIZE_KEYS) {
          for (const style of STYLE_KEYS) {
            const layout = SPECS['sponsor-thanks'].layout({ ...sponsors(n), line } as never, style, size)
            const { used, avail } = fits(layout, size, style)
            expect(used, `${n} sponsors ${size} ${style}: needs ${used}px of ${avail}px`).toBeLessThanOrEqual(avail)
          }
        }
      }
    }
  })

  it('the sponsor logo grid shrinks for a crowded wide page and keeps all sponsors', () => {
    const layout = SPECS['sponsor-thanks'].layout(sponsors(4) as never, 'bold', 'landscape')
    const grid = logosFor(layout, 'landscape', 'bold', room(layout, 'landscape', 'bold'))
    expect(grid?.columns).toBe(4)
    const block = layout.blocks.find((b) => b.kind === 'logos')
    expect(block && block.kind === 'logos' && block.items.length).toBe(4)
  })

  it('the sponsor thank-you drops the footer strip, which would repeat the same sponsors', () => {
    expect(SPECS['sponsor-thanks'].layout(sponsors(2) as never, 'bold', 'square').noStrip).toBe(true)
    expect(SPECS.potm.layout(FIXTURE_DATA.potm as never, 'bold', 'square').noStrip).toBeFalsy()
  })

  it('season wrap fits on the wide page with and without a cover, and never draws an empty photo', () => {
    const base = FIXTURE_DATA['season-wrap'] as SeasonWrapData
    for (const cover of [base.cover, null]) {
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const layout = SPECS['season-wrap'].layout({ ...base, cover } as never, style, size)
          const { used, avail } = fits(layout, size, style)
          expect(used, `cover ${Boolean(cover)} ${size} ${style}: needs ${used}px of ${avail}px`).toBeLessThanOrEqual(avail)
          if (!cover) expect(layout.blocks.some((b) => b.kind === 'photo')).toBe(false)
        }
      }
    }
    expect(SPECS['season-wrap'].layout(base as never, 'bold', 'landscape').blocks.some((b) => b.kind === 'photo')).toBe(false)
  })

  it('weekend preview puts the opponent in the main text and the grade and venue on a second line', () => {
    const base = FIXTURE_DATA.fixtures as FixturesData
    const games = base.games.slice(0, 4).map((g) => ({ ...g, grade: 'B Grade', venue: 'Lang Lang Recreation Reserve', time: '12:30pm' }))
    for (const size of ['square', 'story'] as const) {
      const layout = SPECS.fixtures.layout({ ...base, games } as never, 'minimal', size)
      const rows = layout.blocks.find((b) => b.kind === 'rows')
      if (rows?.kind !== 'rows') throw new Error('no rows')
      expect(rows.rows[0].text).toBe('v Opponent number 1')
      expect(rows.rows[0].detail).toBe('B Grade, Lang Lang Recreation Reserve')
      const { used, avail } = fits(layout, size, 'minimal')
      expect(used).toBeLessThanOrEqual(avail)
    }
    // Wide is short: the opponent is still the main text, the grade follows on the same line, there is no venue.
    const wide = SPECS.fixtures.layout({ ...base, games } as never, 'minimal', 'landscape').blocks.find((b) => b.kind === 'rows')
    if (wide?.kind !== 'rows') throw new Error('no rows')
    expect(wide.rows[0]).toMatchObject({ text: 'v Opponent number 1', sub: 'B Grade' })
  })

  it('a list with second lines is cut sooner than one without', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ text: `Row ${i}` }))
    expect(cutRows(rows, 'story', 0, 1, true).rows.length).toBeLessThan(cutRows(rows, 'story', 0, 1, false).rows.length)
  })
})

describe('sponsor caption wording', () => {
  it('names a tier only for a single sponsor', () => {
    expect(SPECS['sponsor-thanks'].captionVars(sponsors(1) as never)).toEqual({ sponsor: 'Bendigo Bank Lang Lang', tier: 'Gold' })
    expect(SPECS['sponsor-thanks'].captionVars(sponsors(2, ['Platinum', 'Gold']) as never)).toEqual({ sponsor: 'Bendigo Bank Lang Lang and Demo Hardware', tier: '' })
    expect(SPECS['sponsor-thanks'].captionVars(sponsors(2) as never).tier).toBe('')
  })
  it('joins names as a sentence', () => {
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A and B')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNames([])).toBe('')
  })
})
