import { VOTES } from '@/config/site'
import type { GraphicSpec } from '../types'
import { freeText, isGameId, isNumericId, sourceParts } from './helpers'

export type PotmData = {
  player: string
  opponent: string
  grade: string
  round: string | null
  dateLabel: string
  /** `54 off 41 balls  |  2/18 from 6 overs`, or the editable text the staff member typed. */
  statLine: string
  /** The one number worth drawing large, if any. */
  big: { value: string; label: string } | null
}
export type PotmParams = { gameId: string; playerId: number; text: string }

export const potmSpec: GraphicSpec<PotmParams, PotmData> = {
  type: 'potm',
  label: VOTES.label,
  hint: 'You pick the player from that game. Votes are never used.',
  parse(raw) {
    const p = sourceParts(raw, 2)
    if (!p || !isGameId(p[0]) || !isNumericId(p[1])) return null
    return { gameId: p[0], playerId: Number(p[1]), text: freeText(raw) }
  },
  layout(d) {
    return {
      blocks: [
        { kind: 'kicker', text: VOTES.label },
        { kind: 'headline', text: d.player },
        ...(d.big ? [{ kind: 'bigNumber' as const, value: d.big.value, label: d.big.label }] : []),
        ...(d.statLine ? [{ kind: 'subhead' as const, text: d.statLine }] : []),
        { kind: 'text', text: [d.grade, d.round, `v ${d.opponent}`, d.dateLabel].filter(Boolean).join('  |  '), muted: true },
      ],
    }
  },
  captionVars: (d) => ({ award: VOTES.label, player: d.player, opponent: d.opponent, grade: d.grade, round: d.round ?? '', statline: d.statLine, date: d.dateLabel }),
  describe: (d) => `${VOTES.label}: ${d.player} against ${d.opponent}`,
}
