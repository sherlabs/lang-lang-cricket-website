import { cutRows, rowName } from '../density'
import type { GraphicSpec, Row, SizeKey } from '../types'
import { isGameId } from './helpers'

export type LineupPlayer = { order: number; name: string; captain: boolean; keeper: boolean }
export type LineupData = {
  grade: string
  round: string | null
  opponent: string
  whenLabel: string
  venue: string
  showOrder: boolean
  updated: boolean
  players: LineupPlayer[]
}
export type LineupParams = { gameId: string }

const COLUMNS: Record<SizeKey, number> = { square: 2, story: 2, landscape: 3 }

export const lineupSpec: GraphicSpec<LineupParams, LineupData> = {
  type: 'lineup',
  label: 'Team announcement',
  hint: 'The published team for a game.',
  parse(raw) {
    return isGameId(raw.source) ? { gameId: raw.source } : null
  },
  layout(d, style, size) {
    if (!d.players.length) return { blocks: [], empty: 'No players are listed for this team.' }
    const cols = COLUMNS[size]
    const rows: Row[] = d.players.map((p) => ({
      lead: d.showOrder ? String(p.order) : undefined,
      text: rowName(p.name),
      badges: [p.captain ? 'C' : '', p.keeper ? 'WK' : ''].filter(Boolean),
    }))
    // A headline stands for the game; the kicker carries the grade and round, the subhead the date and place.
    // The classic page's band takes more height than the estimate allows for, so its square page keeps one more row of room.
    const cut = cutRows(rows, size, size === 'square' ? (style === 'classic' ? 2 : 1) : 0, cols)
    return {
      blocks: [
        { kind: 'kicker', text: [d.updated ? 'Updated' : '', d.grade, d.round].filter(Boolean).join('  |  ') },
        { kind: 'headline', text: `v ${d.opponent}` },
        { kind: 'subhead', text: [d.whenLabel, d.venue].filter(Boolean).join('  |  ') },
        { kind: 'rows', rows: cut.rows, more: cut.more, columns: cols },
      ],
    }
  },
  captionVars: (d) => ({ opponent: d.opponent, grade: d.grade, round: d.round ?? '', venue: d.venue, date: d.whenLabel, team: d.grade }),
  describe: (d) => `${d.grade} team against ${d.opponent}: ${d.players.length} players`,
}
