import { rowName } from '../density'
import type { Block, GraphicSpec } from '../types'
import { isGameId } from './helpers'

export type TossData = {
  /** The side that won the toss: the club's short name, or the opponent. */
  winner: string
  clubWon: boolean
  /** What the winner chose, when known. */
  choice: 'bat' | 'bowl' | null
  opponent: string
  grade: string
  round: string | null
  dateLabel: string
  venue: string
}
export type TossParams = { gameId: string }

const sentence = (d: TossData, name: string): string => `${name} won the toss${d.choice ? ` and chose to ${d.choice}` : ''}`

export const tossSpec: GraphicSpec<TossParams, TossData> = {
  type: 'toss',
  label: 'The toss',
  hint: 'Who won the toss and what they chose, for a game that has been played.',
  parse(raw) {
    return isGameId(raw.source) ? { gameId: raw.source } : null
  },
  layout(d) {
    if (!d.winner) return { blocks: [], empty: 'Toss details are not in yet for this game.' }
    const blocks: Block[] = [
      { kind: 'kicker', text: 'The toss' },
      { kind: 'headline', text: sentence(d, rowName(d.winner)) },
      { kind: 'text', text: `vs ${rowName(d.opponent)}  |  ${d.round || d.dateLabel}` },
    ]
    if (d.venue) blocks.push({ kind: 'text', text: d.venue, muted: true })
    return { blocks }
  },
  captionVars: (d) => ({ winner: d.winner, choice: d.choice ? `Chose to ${d.choice}` : '', opponent: d.opponent, round: d.round ?? '', grade: d.grade, date: d.dateLabel }),
  describe: (d) => `${sentence(d, d.winner)} against ${d.opponent}`,
}
