import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lineupRows, topBatters, topBowlers } from '@/lib/social/filters'
import { deriveMargin, playedInMatch, potmFigures } from '@/lib/social/results'
import { SPECS } from '@/lib/social/specs'
import { FREE_TEXT_MAX, SIZE_KEYS, STYLE_KEYS, TYPE_KEYS, cleanText, type Block } from '@/lib/social/types'
import type { StoredInnings } from '@/lib/match-store/queries'
import { EMPTY_DATA, FIXTURE_DATA } from './helpers/social-fixtures'

const textOf = (blocks: Block[]): string[] =>
  blocks.flatMap((b) => {
    switch (b.kind) {
      case 'kicker': case 'headline': case 'subhead': case 'text': return [b.text]
      case 'bigNumber': return [b.value, b.label ?? '']
      case 'versus': return [b.club.name, b.opp.name, b.club.score, b.opp.score]
      case 'rows': return b.rows.flatMap((r) => [r.text, r.value ?? '', r.sub ?? ''])
      case 'photo': return [b.title, ...b.lines]
      case 'logos': return b.items.map((i) => i.name)
    }
  })

describe('graphic specs: parse', () => {
  const G = 'imp:abc-123'
  const good: Record<string, Record<string, string>> = {
    result: { source: `single|${G}` },
    fixtures: { source: '2026-10-17' },
    lineup: { source: G },
    potm: { source: `${G}|12`, text: 'x' },
    milestone: { source: '12|runs|1000|a' },
    'stats-leaders': { source: 'runs|Summer 2025/26|default|5' },
    'event-promo': { source: '7' },
    'sponsor-thanks': { source: '1,2,3' },
    'season-wrap': { source: 'summer-2025-26' },
  }
  const bad: Record<string, Record<string, string>[]> = {
    result: [{}, { source: 'single|' }, { source: 'nope|x' }, { source: 'round|2026-13-45' }, { source: 'single|a b' }, { source: `single|${'x'.repeat(100)}` }],
    fixtures: [{}, { source: 'tomorrow' }, { source: '2026-02-30x' }],
    lineup: [{}, { source: '../etc/passwd' }, { source: '' }],
    potm: [{}, { source: `${G}` }, { source: `${G}|abc` }, { source: `${G}|1|2` }],
    milestone: [{}, { source: '1|speed|10|a' }, { source: '1|runs|10|x' }, { source: 'x|runs|10|a' }],
    'stats-leaders': [{}, { source: 'runs|all|default|4' }, { source: 'r!|all|default|3' }, { source: 'runs|<script>|default|3' }],
    'event-promo': [{}, { source: 'abc' }, { source: '-1' }],
    'sponsor-thanks': [{}, { source: '1,2,3,4,5' }, { source: '1;2' }, { source: 'a' }],
    'season-wrap': [{}, { source: 'A B' }, { source: '' }],
  }
  for (const type of TYPE_KEYS) {
    it(`${type}: accepts good input and rejects bad input`, () => {
      expect(SPECS[type].parse(good[type]), 'good').not.toBeNull()
      for (const raw of bad[type]) expect(SPECS[type].parse(raw), JSON.stringify(raw)).toBeNull()
    })
  }

  it('cleans the free text: 80 characters, control characters out', () => {
    const p = SPECS.potm.parse({ source: `${G}|12`, text: `  ${'a'.repeat(200)}\u0007\n` }) as { text: string }
    expect(p.text).toHaveLength(FREE_TEXT_MAX)
    expect(cleanText('a\u0000b\u0007c\td')).toBe('a b c d')
    expect(cleanText(undefined)).toBe('')
  })
})

describe('graphic specs: layout', () => {
  it('returns blocks for every type in every size and style (81 combinations)', () => {
    let n = 0
    for (const type of TYPE_KEYS) {
      for (const size of SIZE_KEYS) {
        for (const style of STYLE_KEYS) {
          const out = SPECS[type].layout(FIXTURE_DATA[type], style, size)
          expect(out.blocks.length, `${type} ${size} ${style}`).toBeGreaterThan(0)
          expect(out.empty).toBeUndefined()
          n++
        }
      }
    }
    expect(n).toBe(81)
  })

  it('cuts a long list at a whole row with "+ N more" and keeps the cut inside the size', () => {
    for (const size of SIZE_KEYS) {
      const out = SPECS.fixtures.layout(FIXTURE_DATA.fixtures, 'bold', size)
      const rows = out.blocks.find((b) => b.kind === 'rows')
      expect(rows?.kind).toBe('rows')
      if (rows?.kind !== 'rows') continue
      const max = { square: 7, story: 11, landscape: 5 }[size]
      expect(rows.rows.length + (rows.more ? 1 : 0)).toBeLessThanOrEqual(max)
      expect(rows.rows.length + rows.more).toBe(9)
    }
  })

  it('the lineup shows the whole team in columns where it fits and counts the rest otherwise', () => {
    const rows = (size: 'square' | 'story' | 'landscape') => SPECS.lineup.layout(FIXTURE_DATA.lineup, 'bold', size).blocks.find((b) => b.kind === 'rows')
    const story = rows('story')
    expect(story?.kind === 'rows' && story.more).toBe(0)
    expect(story?.kind === 'rows' && story.columns).toBe(2)
    const wide = rows('landscape')
    expect(wide?.kind === 'rows' && wide.columns).toBe(3)
  })

  it('empty data gives the type message instead of throwing', () => {
    for (const [type, data] of Object.entries(EMPTY_DATA)) {
      for (const size of SIZE_KEYS) {
        const out = SPECS[type as keyof typeof SPECS].layout(data, 'classic', size)
        expect(out.empty, `${type} ${size}`).toMatch(/\w/)
      }
    }
  })

  it('long names are cut by character budget, not left to overflow', () => {
    const long = { ...(FIXTURE_DATA.lineup as { players: { order: number; name: string; captain: boolean; keeper: boolean }[] }), players: [{ order: 1, name: 'A'.repeat(80), captain: false, keeper: false }] }
    for (const size of SIZE_KEYS) {
      const rows = SPECS.lineup.layout(long, 'bold', size).blocks.find((b) => b.kind === 'rows')
      expect(rows?.kind === 'rows' && rows.rows[0].text.length).toBeLessThanOrEqual(30)
    }
  })

  it('no hand-picked text strings come from user input as markup: layout output is text only', () => {
    const out = SPECS.potm.layout({ ...(FIXTURE_DATA.potm as object), player: '<img src=x onerror=1>' } as never, 'bold', 'square')
    expect(textOf(out.blocks).join(' ')).toContain('<img')
    expect(JSON.stringify(out.blocks)).not.toMatch(/dangerouslySetInnerHTML/)
  })
})

describe('eligibility in the data a picture is made from', () => {
  const slots = [
    { order: 1, name: 'Adult Person', slug: 'adult-person', isCaptain: true, isKeeper: false, withheld: false, guest: false },
    { order: 2, name: 'Junior NoOptIn', slug: 'junior-no', isCaptain: false, isKeeper: false, withheld: false, guest: false },
    { order: 3, name: 'Junior OptIn', slug: 'junior-yes', isCaptain: false, isKeeper: true, withheld: false, guest: false },
    { order: 4, name: 'Player name withheld', slug: null, isCaptain: false, isKeeper: false, withheld: true, guest: false },
    { order: 5, name: 'Some Guest', slug: null, isCaptain: false, isKeeper: false, withheld: false, guest: true },
    { order: 6, name: 'Unknown Person', slug: 'unknown', isCaptain: false, isKeeper: false, withheld: false, guest: false },
  ]
  const eligible = new Map([['adult-person', true], ['junior-no', false], ['junior-yes', true]])
  it('a junior without the opt-in, a guest and an unknown player never appear by name in a lineup; with the opt-in they do', () => {
    const names = lineupRows(slots, eligible, 'Player name withheld').map((r) => r.name)
    expect(names).toEqual(['Adult Person', 'Junior OptIn', 'Player name withheld', 'Guest player'])
    expect(names.join('|')).not.toMatch(/Junior NoOptIn|Some Guest|Unknown Person/)
  })

  const inn = (over: Partial<StoredInnings>): StoredInnings => ({ batting: [], bowling: [], fielding: [], didNotBat: [], ...over } as unknown as StoredInnings)
  const bat = (playerId: number | null, name: string, runs: number, isClubSide = true) => ({ appearanceId: String(playerId), playerId, name, isClubSide, position: 1, status: 'out', runs, balls: 10 })
  const bowl = (playerId: number | null, name: string, wickets: number, runs: number, isClubSide = true) => ({ appearanceId: String(playerId), playerId, name, isClubSide, order: 1, balls: 24, maidens: 0, runs, wickets, wides: 0, noBalls: 0 })
  const innings = [inn({ batting: [bat(1, 'Adult', 40), bat(2, 'Junior', 90), bat(null, 'Other Team', 120, false)] as never, bowling: [bowl(1, 'Adult', 1, 20), bowl(2, 'Junior', 4, 10)] as never })]
  const ok = (id: number | null) => id === 1
  it('top batters and bowlers drop ineligible players and the opposition', () => {
    expect(topBatters(innings, ok).map((b) => b.name)).toEqual(['Adult'])
    expect(topBowlers(innings, ok).map((b) => b.name)).toEqual(['Adult'])
    expect(topBatters(innings, (id) => id !== null).map((b) => b.name)).toEqual(['Junior', 'Adult'])
  })
})

describe('results wording', () => {
  const side = (seq: number, runs: number | null, wickets: number | null) => ({ seq, runs, wickets, balls: 240, declared: false, allOut: wickets === 10 })
  const line = (result: 'won' | 'lost' | 'draw', club: ReturnType<typeof side>[], opp: ReturnType<typeof side>[], extra = {}) => ({ result, forfeit: false, onFirstInnings: false, club, opp, ...extra })
  it('works out runs and wickets margins, and nothing when it is not certain', () => {
    expect(deriveMargin(line('won', [side(1, 182, 6)], [side(2, 158, 10)]))).toBe('by 24 runs')
    expect(deriveMargin(line('won', [side(2, 160, 6)], [side(1, 158, 10)]))).toBe('by 4 wickets')
    expect(deriveMargin(line('lost', [side(1, 150, 10)], [side(2, 151, 9)]))).toBe('by 1 wicket')
    expect(deriveMargin(line('lost', [side(2, 100, 10)], [side(1, 101, 8)]))).toBe('by 1 run')
    expect(deriveMargin(line('draw', [side(1, 100, 8)], [side(2, 100, 8)]))).toBe('')
    expect(deriveMargin(line('won', [side(1, 100, 2), side(3, 90, 1)], [side(2, 80, 10), side(4, 50, 10)]))).toBe('')
    expect(deriveMargin(line('won', [side(1, null, null)], [side(2, 10, 10)]))).toBe('')
    expect(deriveMargin(line('won', [side(1, 182, 6)], [side(2, 158, 10)], { forfeit: true }))).toBe('')
  })

  const m = {
    squad: [{ playerId: 1, name: 'Starr' }, { playerId: 3, name: 'Bench' }],
    innings: [{
      batting: [{ playerId: 1, runs: 112, balls: 84, status: 'not_out' }, { playerId: 2, runs: 5, balls: 10, status: 'out' }],
      bowling: [{ playerId: 1, balls: 36, runs: 21, wickets: 2 }],
      fielding: [{ playerId: 4 }],
    }],
  } as unknown as Parameters<typeof potmFigures>[0] & Parameters<typeof playedInMatch>[0]
  it('builds the player of the match stat line from that game only', () => {
    expect(potmFigures(m, 1)).toEqual({ statLine: '112* off 84 balls  |  2/21 from 6.0 overs', big: { value: '112*', label: 'runs' } })
    expect(potmFigures(m, 99)).toEqual({ statLine: '', big: null })
  })
  it('knows who was in the game: squad, batting, bowling or fielding', () => {
    expect([1, 2, 3, 4, 99].map((id) => playedInMatch(m, id))).toEqual([true, true, true, true, false])
  })
})

describe('no hex colours in lib/social', () => {
  const root = path.resolve(__dirname, '..')
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((e) => (statSync(path.join(dir, e)).isDirectory() ? walk(path.join(dir, e)) : [path.join(dir, e)]))
  it('imports colours only from the theme or the neutral constants', () => {
    const files = walk(path.join(root, 'lib/social')).filter((f) => /\.(ts|tsx)$/.test(f))
    expect(files.length).toBeGreaterThan(15)
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')
      expect(text.match(/#[0-9a-fA-F]{3,8}\b/g), path.relative(root, f)).toBeNull()
    }
  })
})
