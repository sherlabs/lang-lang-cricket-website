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
    const rows: Row[] = d.games.map((g) => ({ lead: g.dayLabel.slice(0, 3), text: `${g.grade} v ${rowName(g.opponent, size)}`, value: g.time, sub: size === 'landscape' ? undefined : g.venue }))
    const cut = cutRows(rows, size, 0)
    return { blocks: [{ kind: 'kicker', text: d.weekLabel }, { kind: 'headline', text: 'This weekend' }, { kind: 'rows', rows: cut.rows, more: cut.more }] }
  },
  captionVars: (d) => ({ date: d.weekLabel, count: String(d.games.length) }),
  describe: (d) => `Weekend preview for ${d.weekLabel}: ${d.games.length} games`,
}
