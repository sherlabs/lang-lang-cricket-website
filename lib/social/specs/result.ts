import { cutRows, rowName } from '../density'
import type { Block, GraphicLayout, GraphicSpec, Row, SizeKey, StyleKey } from '../types'
import { freeText, isGameId, isIsoDate, sourceParts } from './helpers'

export type ResultGame = {
  gameId: string
  grade: string
  team: string
  round: string | null
  date: string
  dateLabel: string
  venue: string
  opponent: string
  /** `W`, `L`, `D`, `T`, `N` or a dash. */
  letter: string
  /** `Won`, `Lost by forfeit`... */
  word: string
  clubScore: string
  oppScore: string
  clubShort: string
  oppShort: string
  /** `by 24 runs`, `by 3 wickets`, or empty when it cannot be worked out. */
  margin: string
}
export type ResultPlayerLine = { name: string; figures: string }
export type ResultData =
  | { mode: 'single'; game: ResultGame }
  | { mode: 'scorecard'; game: ResultGame; batters: ResultPlayerLine[]; bowlers: ResultPlayerLine[] }
  | { mode: 'round'; dateLabel: string; round: string | null; games: ResultGame[] }

export type ResultParams = { mode: 'single' | 'scorecard'; gameId: string; text: string } | { mode: 'round'; date: string; text: string }

const HOW_MANY = { square: 2, story: 5, landscape: 2 } as const

export const resultSpec: GraphicSpec<ResultParams, ResultData> = {
  type: 'result',
  label: 'Results',
  hint: 'The final score of a game, with the top performers, or a whole round.',
  parse(raw) {
    const p = sourceParts(raw, 2)
    if (!p) return null
    const text = freeText(raw)
    if (p[0] === 'round') return isIsoDate(p[1]) ? { mode: 'round', date: p[1], text } : null
    if ((p[0] === 'single' || p[0] === 'scorecard') && isGameId(p[1])) return { mode: p[0], gameId: p[1], text }
    return null
  },
  layout(d, style: StyleKey, size: SizeKey): GraphicLayout {
    void style
    if (d.mode === 'round') {
      if (!d.games.length) return { blocks: [], empty: 'No finished games on this round yet.' }
      const rows: Row[] = d.games.map((g) => ({ lead: g.letter, text: `${g.grade} v ${rowName(g.opponent, size)}`, value: g.clubShort && g.oppShort ? `${g.clubShort} v ${g.oppShort}` : g.word }))
      const cut = cutRows(rows, size, 0)
      return { blocks: [{ kind: 'kicker', text: d.dateLabel }, { kind: 'headline', text: d.round ? `${d.round} results` : 'Round results' }, { kind: 'rows', rows: cut.rows, more: cut.more }] }
    }
    const g = d.game
    const head = [g.grade, g.round].filter(Boolean).join('  |  ')
    const resultLine = [g.word, g.margin].filter(Boolean).join(' ')
    const base: Block[] = [
      { kind: 'kicker', text: head },
      { kind: 'headline', text: resultLine || 'Full time' },
      { kind: 'versus', club: { name: g.team, score: g.clubShort || g.clubScore || '–' }, opp: { name: rowName(g.opponent, size), score: g.oppShort || g.oppScore || '–' } },
    ]
    if (d.mode === 'single') return { blocks: [...base, { kind: 'text', text: [g.dateLabel, g.venue].filter(Boolean).join('  |  '), muted: true }] }
    const n = HOW_MANY[size]
    const batters: Row[] = d.batters.slice(0, n).map((b) => ({ text: rowName(b.name, size), value: b.figures }))
    const bowlers: Row[] = d.bowlers.slice(0, n).map((b) => ({ text: rowName(b.name, size), value: b.figures }))
    const blocks = [...base]
    if (batters.length) blocks.push({ kind: 'rows', rows: batters, more: 0, title: 'Batting' })
    if (bowlers.length) blocks.push({ kind: 'rows', rows: bowlers, more: 0, title: 'Bowling' })
    return { blocks }
  },
  captionVars(d): Record<string, string> {
    if (d.mode === 'round') return { date: d.dateLabel, grade: d.round ?? '' }
    const g = d.game
    return { team: g.team, opponent: g.opponent, grade: g.grade, round: g.round ?? '', score: g.clubShort && g.oppShort ? `${g.clubShort} v ${g.oppShort}` : '', margin: [g.word, g.margin].filter(Boolean).join(' '), venue: g.venue, date: g.dateLabel }
  },
  describe(d) {
    if (d.mode === 'round') return `Round results for ${d.dateLabel}: ${d.games.length} games`
    return `${d.game.grade} result against ${d.game.opponent}: ${d.game.word}`
  },
}
