import type { GraphicSpec } from '../types'
import { cleanText } from '../types'
import { isNumericId, sourceParts } from './helpers'

export const MILESTONE_KEYS = ['games', 'runs', 'wickets', 'catches'] as const
export type MilestoneParamKey = (typeof MILESTONE_KEYS)[number]

export type MilestoneData = {
  player: string
  /** `1,000`. */
  figure: string
  /** `runs`. */
  unit: string
  kind: 'achieved' | 'approaching'
  /** `1,000 runs, reached in 2024/25` or `12 runs to go for 1,000 runs`. */
  detail: string
}
export type MilestoneParams = { playerId: number; key: MilestoneParamKey; threshold: number; kind: 'achieved' | 'approaching'; text: string }

export const milestoneSpec: GraphicSpec<MilestoneParams, MilestoneData> = {
  type: 'milestone',
  label: 'Milestone',
  hint: 'A player who reached, or is close to, a landmark.',
  parse(raw) {
    const p = sourceParts(raw, 4)
    if (!p || !isNumericId(p[0]) || !(MILESTONE_KEYS as readonly string[]).includes(p[1]) || !/^[0-9]{1,6}$/.test(p[2]) || (p[3] !== 'a' && p[3] !== 'n')) return null
    return { playerId: Number(p[0]), key: p[1] as MilestoneParamKey, threshold: Number(p[2]), kind: p[3] === 'a' ? 'achieved' : 'approaching', text: cleanText(raw.text) }
  },
  layout(d) {
    return {
      blocks: [
        { kind: 'kicker', text: d.kind === 'achieved' ? 'Milestone' : 'Nearly there' },
        { kind: 'headline', text: d.player },
        { kind: 'bigNumber', value: d.figure, label: d.unit },
        { kind: 'subhead', text: d.detail },
      ],
    }
  },
  captionVars: (d) => ({ player: d.player, milestone: d.kind === 'achieved' ? `${d.figure} ${d.unit}` : d.detail.replace(/^\d.* to go for /, 'within reach of ') }),
  describe: (d) => `${d.player}: ${d.detail}`,
}
