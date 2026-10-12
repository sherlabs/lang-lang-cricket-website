/** Wave D WP-0: the toss graphic, the name-only sponsor thank-you and the minimal-style season leaders spacing (#21). Pure, no database. */
import { describe, expect, it } from 'vitest'
import { availableHeight, FILL_SCALE_CAP, footerHeight, layoutHeight } from '@/lib/social/fit'
import { DEFAULT_CAPTIONS, CAPTION_VARS, fillTemplate } from '@/lib/social/caption'
import { SPECS } from '@/lib/social/specs'
import type { LeadersData } from '@/lib/social/specs/stats-leaders'
import type { SponsorThanksData } from '@/lib/social/specs/sponsor-thanks'
import type { TossData } from '@/lib/social/specs/toss'
import { tossWinnerSide } from '@/lib/social/toss'
import { SIZE_KEYS, STYLE_KEYS, type Block, type GraphicLayout, type SizeKey, type StyleKey } from '@/lib/social/types'
import { FIXTURE_DATA, TINY_PNG } from './helpers/social-fixtures'

const room = (layout: GraphicLayout, size: SizeKey, style: StyleKey) => availableHeight(size, style, footerHeight(size, { strip: !layout.noStrip, text: true }))
const fits = (layout: GraphicLayout, size: SizeKey, style: StyleKey) => {
  const avail = room(layout, size, style)
  return { used: layoutHeight(layout, size, style, avail), avail }
}
const textOfBlocks = (blocks: Block[]): string[] => blocks.flatMap((b) => ('text' in b ? [b.text] : b.kind === 'names' ? b.items.map((i) => i.name) : []))

describe('toss: who won', () => {
  it('reads the winner from clubWonToss first, then from the team ids, else null', () => {
    expect(tossWinnerSide({ clubWonToss: true })).toBe('club')
    expect(tossWinnerSide({ clubWonToss: false })).toBe('opponent')
    expect(tossWinnerSide({ clubWonToss: null, tossWinnerTeamId: 'c1', clubTeamId: 'c1', opponentTeamId: 'o1' })).toBe('club')
    expect(tossWinnerSide({ clubWonToss: null, tossWinnerTeamId: 'o1', clubTeamId: 'c1', opponentTeamId: 'o1' })).toBe('opponent')
    // A winner id that matches neither team cannot be named, so the game has no toss graphic.
    expect(tossWinnerSide({ clubWonToss: null, tossWinnerTeamId: 'zzz', clubTeamId: 'c1', opponentTeamId: 'o1' })).toBeNull()
    expect(tossWinnerSide({ clubWonToss: null, tossWinnerTeamId: null })).toBeNull()
    expect(tossWinnerSide({})).toBeNull()
  })
})

describe('toss: layout', () => {
  const base = FIXTURE_DATA.toss as TossData
  const head = (d: TossData) => {
    const b = SPECS.toss.layout(d, 'bold', 'square').blocks.find((x) => x.kind === 'headline')
    return b && b.kind === 'headline' ? b.text : ''
  }
  it('club won and chose to bat / bowl, opponent won, winner without a choice', () => {
    expect(head(base)).toBe('Club won the toss and chose to bat')
    expect(head({ ...base, choice: 'bowl' })).toBe('Club won the toss and chose to bowl')
    expect(head({ ...base, clubWon: false, winner: 'Rivals United', choice: 'bowl' })).toBe('Rivals United won the toss and chose to bowl')
    expect(head({ ...base, choice: null })).toBe('Club won the toss')
  })
  it('has the kicker, the opponent line with the round (or the date), and the venue when stored', () => {
    const t = textOfBlocks(SPECS.toss.layout(base, 'classic', 'square').blocks)
    expect(t).toEqual(['The toss', 'Club won the toss and chose to bat', 'vs Rivals United  |  Round 4', 'Home Oval, Lang Lang'])
    const noRound = textOfBlocks(SPECS.toss.layout({ ...base, round: null, venue: '' }, 'classic', 'square').blocks)
    expect(noRound).toEqual(['The toss', 'Club won the toss and chose to bat', 'vs Rivals United  |  Sat 11 Oct'])
  })
  it('names no player, so no player name can be drawn', () => {
    expect(JSON.stringify(SPECS.toss.layout(base, 'bold', 'square'))).not.toMatch(/Alex|Sam|Junior/)
  })
  it('says so plainly when there is no winner', () => {
    for (const size of SIZE_KEYS) expect(SPECS.toss.layout({ ...base, winner: '' }, 'bold', size).empty).toMatch(/Toss details are not in yet/)
  })
  it('fits every size and style, even with a 60-character opponent, cut with an ellipsis', () => {
    const long = { ...base, clubWon: false, winner: 'O'.repeat(60), opponent: 'P'.repeat(60), venue: 'V'.repeat(80) }
    for (const d of [base, long]) {
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const layout = SPECS.toss.layout(d, style, size)
          const { used, avail } = fits(layout, size, style)
          expect(used, `${size} ${style}: needs ${used}px of ${avail}px`).toBeLessThanOrEqual(avail)
        }
      }
    }
    const t = textOfBlocks(SPECS.toss.layout(long, 'bold', 'square').blocks).join(' ')
    expect(t).toContain('…')
    expect(t).not.toContain('O'.repeat(60))
  })
  it('caption: the standard wording fills, and drops the choice line when it is unknown', () => {
    const vars = (d: TossData) => ({ club: 'Club', link: 'https://example.test/matches', ...SPECS.toss.captionVars(d) })
    const full = fillTemplate(DEFAULT_CAPTIONS.toss, vars(base), CAPTION_VARS.toss)
    expect(full.unknown).toEqual([])
    expect(full.text).toContain('Club won the toss.')
    expect(full.text).toContain('Chose to bat')
    expect(fillTemplate(DEFAULT_CAPTIONS.toss, vars({ ...base, choice: null }), CAPTION_VARS.toss).text).not.toContain('Chose')
  })
})

describe('sponsor thank-you: name-only fallback', () => {
  const sp = (...rows: [string, string, boolean][]): SponsorThanksData => ({ sponsors: rows.map(([name, tier, logo]) => ({ name, tier, logo: logo ? TINY_PNG : null })), line: '' })
  const kinds = (d: SponsorThanksData, style: StyleKey = 'bold', size: SizeKey = 'square') => SPECS['sponsor-thanks'].layout(d, style, size).blocks.map((b) => b.kind)
  const one = sp(['Alpha Hardware', 'Gold', true])
  const oneBare = sp(['Alpha Hardware', 'Gold', false])
  const two = sp(['Alpha Hardware', 'Gold', true], ['Beta Plumbing', 'Silver', true])
  const twoBare = sp(['Alpha Hardware', 'Gold', false], ['Beta Plumbing', 'Silver', false])
  const mixed4 = sp(['Alpha Hardware', 'Gold', true], ['Beta Plumbing', 'Silver', false], ['Gamma Fuel', 'Gold', true], ['Delta Cafe', 'Bronze', false])
  const bare4 = sp(['Alpha Hardware', 'Gold', false], ['Beta Plumbing', 'Silver', false], ['Gamma Fuel', 'Gold', false], ['Delta Cafe', 'Bronze', false])

  it('block kinds per case (a snapshot of structure, not pixels)', () => {
    expect(kinds(one)).toEqual(['kicker', 'headline', 'logos'])
    expect(kinds(oneBare)).toEqual(['kicker', 'headline']) // the headline already names the sponsor: no duplicate block
    expect(kinds(two)).toEqual(['kicker', 'headline', 'logos'])
    expect(kinds(twoBare)).toEqual(['kicker', 'headline', 'names'])
    expect(kinds(mixed4)).toEqual(['kicker', 'headline', 'logos', 'names'])
    expect(kinds(bare4)).toEqual(['kicker', 'headline', 'names'])
  })
  it('a single name-only sponsor shows its level in the kicker and the name once, as the headline', () => {
    const t = textOfBlocks(SPECS['sponsor-thanks'].layout(oneBare, 'bold', 'square').blocks)
    expect(t).toEqual(['Thank you  |  Gold', 'Alpha Hardware'])
  })
  it('the logos block holds only drawable logos and the names block only the rest; no initial is ever produced', () => {
    const blocks = SPECS['sponsor-thanks'].layout(mixed4, 'bold', 'square').blocks
    const logos = blocks.find((b) => b.kind === 'logos')
    const names = blocks.find((b) => b.kind === 'names')
    expect(logos?.kind === 'logos' && logos.items.map((i) => i.name)).toEqual(['Alpha Hardware', 'Gamma Fuel'])
    expect(logos?.kind === 'logos' && logos.items.every((i) => typeof i.src === 'string' && i.src.length > 0)).toBe(true)
    expect(names?.kind === 'names' && names.items).toEqual([{ name: 'Beta Plumbing', tier: 'Silver' }, { name: 'Delta Cafe', tier: 'Bronze' }])
    // No single-letter text (the old initial tile) in any block.
    expect(textOfBlocks(blocks).filter((x) => x.length === 1)).toEqual([])
  })
  it('fits every case at every size and style, with and without a message', () => {
    for (const d of [one, oneBare, two, twoBare, mixed4, bare4]) {
      for (const line of ['', 'Thank you for backing the club this season, we could not do it without every one of you.']) {
        for (const size of SIZE_KEYS) {
          for (const style of STYLE_KEYS) {
            const layout = SPECS['sponsor-thanks'].layout({ ...d, line }, style, size)
            const { used, avail } = fits(layout, size, style)
            expect(used, `${kinds(d).join()} line=${line.length} ${size} ${style}: needs ${used}px of ${avail}px`).toBeLessThanOrEqual(avail)
          }
        }
      }
    }
  })
  it('a very long sponsor name still fits (it is cut on one line by the renderer)', () => {
    const long = sp(['N'.repeat(70), 'Gold', false], ['M'.repeat(70), 'Gold', false], ['L'.repeat(70), 'Gold', false], ['K'.repeat(70), 'Gold', false])
    for (const size of SIZE_KEYS) for (const style of STYLE_KEYS) {
      const { used, avail } = fits(SPECS['sponsor-thanks'].layout(long, style, size), size, style)
      expect(used, `${size} ${style}`).toBeLessThanOrEqual(avail)
    }
  })
})

describe('season leaders: minimal fills its page', () => {
  const rowsOf = (n: number): LeadersData => ({ ...(FIXTURE_DATA['stats-leaders'] as LeadersData), rows: (FIXTURE_DATA['stats-leaders'] as LeadersData).rows.slice(0, n) })
  const density = (count: number, size: SizeKey, style: StyleKey) => {
    const { used, avail } = fits(SPECS['stats-leaders'].layout(rowsOf(count), style, size), size, style)
    return { used, avail, ratio: used / avail }
  }
  const MIN_DENSITY = 0.8

  it('minimal uses at least 80% of the room on every page size (3 and 5 rows), and always fits', () => {
    for (const count of [3, 5]) {
      for (const size of SIZE_KEYS) {
        const d = density(count, size, 'minimal')
        expect(d.ratio, `${count} rows ${size}: ${d.used}px of ${d.avail}px`).toBeGreaterThanOrEqual(MIN_DENSITY)
        expect(d.used).toBeLessThanOrEqual(d.avail)
      }
    }
  })
  it('every style, size and row count fits, and the requested row count is kept', () => {
    for (const count of [3, 5]) for (const size of SIZE_KEYS) for (const style of STYLE_KEYS) {
      const layout = SPECS['stats-leaders'].layout(rowsOf(count), style, size)
      const { used, avail } = fits(layout, size, style)
      expect(used, `${count} ${size} ${style}`).toBeLessThanOrEqual(avail)
      const rows = layout.blocks.find((b) => b.kind === 'rows')
      expect(rows?.kind === 'rows' && rows.rows.length).toBe(count)
    }
  })
  it('bold and classic are unchanged (no scale), minimal differs only by the row scale, capped at the fill cap', () => {
    for (const count of [3, 5]) for (const size of SIZE_KEYS) {
      const bold = SPECS['stats-leaders'].layout(rowsOf(count), 'bold', size)
      const classic = SPECS['stats-leaders'].layout(rowsOf(count), 'classic', size)
      const minimal = SPECS['stats-leaders'].layout(rowsOf(count), 'minimal', size)
      expect(JSON.stringify(bold)).not.toContain('scale')
      expect(JSON.stringify(classic)).toBe(JSON.stringify(bold))
      const strip = (l: GraphicLayout) => JSON.stringify({ ...l, blocks: l.blocks.map((b) => (b.kind === 'rows' ? { ...b, scale: undefined } : b)) })
      expect(strip(minimal)).toBe(strip(bold))
      const rows = minimal.blocks.find((b) => b.kind === 'rows')
      const scale = rows?.kind === 'rows' ? (rows.scale ?? 1) : 1
      expect(scale).toBeGreaterThanOrEqual(1)
      expect(scale).toBeLessThanOrEqual(FILL_SCALE_CAP)
    }
  })
})
