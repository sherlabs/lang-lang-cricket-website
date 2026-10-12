import { cutRows, rowName } from '../density'
import type { GraphicSpec, Row } from '../types'
import { isIsoDate } from './helpers'

export type FixtureGame = { grade: string; round: string | null; dayLabel: string; time: string; opponent: string; venue: string; home: boolean }
export type FixturesData = { weekLabel: string; games: FixtureGame[] }
export type FixturesParams = { weekend: string }

export const fixturesSpec: GraphicSpec<FixturesParams, FixturesData> = {
  type: 'fixtures',
  label: 'Weekend preview',
  hint: 'The games coming up on a weekend.',
  parse(raw) {
    return isIsoDate(raw.source) ? { weekend: raw.source } : null
  },
  layout(d, _style, size) {
    if (!d.games.length) return { blocks: [], empty: 'No games are listed for this weekend yet.' }
    // The opponent is the main text; the grade and venue sit on a second line (wide is short, so there only the grade, beside it).
    const wide = size === 'landscape'
    const rows: Row[] = d.games.map((g) => ({
      lead: g.dayLabel.slice(0, 3),
      text: `v ${rowName(g.opponent, size)}`,
      value: g.time,
      ...(wide ? { sub: g.grade } : { detail: [g.grade, g.venue].filter(Boolean).join(', ') }),
    }))
    const cut = cutRows(rows, size, 0, 1, !wide)
    return { blocks: [{ kind: 'kicker', text: d.weekLabel }, { kind: 'headline', text: 'This weekend' }, { kind: 'rows', rows: cut.rows, more: cut.more }] }
  },
  captionVars: (d) => ({ date: d.weekLabel, count: String(d.games.length) }),
  describe: (d) => `Weekend preview for ${d.weekLabel}: ${d.games.length} games`,
}
