import type { Block, GraphicSpec } from '../types'
import { isSafeId } from './helpers'

export type SeasonWrapData = {
  title: string
  seasonLabel: string
  premiership: string
  cover: string | null
  /** `12 wins, 3 losses`, or empty when no results are stored. */
  record: string
  topRuns: { name: string; value: string } | null
  topWickets: { name: string; value: string } | null
}
export type SeasonWrapParams = { slug: string }

export const seasonWrapSpec: GraphicSpec<SeasonWrapParams, SeasonWrapData> = {
  type: 'season-wrap',
  label: 'Season wrap',
  hint: 'A published season yearbook in one picture.',
  parse(raw) {
    return isSafeId(raw.source) ? { slug: raw.source } : null
  },
  layout(d) {
    const blocks: Block[] = [{ kind: 'kicker', text: d.seasonLabel }, { kind: 'photo', src: d.cover, title: d.title, lines: [d.premiership].filter(Boolean) }]
    const rows = [
      d.record ? { text: 'Record', value: d.record } : null,
      d.topRuns ? { text: `Most runs: ${d.topRuns.name}`, value: d.topRuns.value } : null,
      d.topWickets ? { text: `Most wickets: ${d.topWickets.name}`, value: d.topWickets.value } : null,
    ].filter((r): r is { text: string; value: string } => r !== null)
    if (rows.length) blocks.push({ kind: 'rows', rows, more: 0 })
    return { blocks }
  },
  captionVars: (d) => ({ season: d.seasonLabel, record: d.record }),
  describe: (d) => `Season wrap: ${d.title}`,
}
