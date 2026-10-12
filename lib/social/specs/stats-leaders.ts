import { cutRows, rowName } from '../density'
import type { GraphicSpec, Row } from '../types'
import { isLabelToken, sourceParts } from './helpers'

export type LeadersData = {
  metric: string
  seasonLabel: string
  scopeLabel: string
  rows: { rank: number; name: string; value: string; context: string }[]
}
export type LeadersParams = { metric: string; season: string; cat: string; count: 3 | 5 }

export const leadersSpec: GraphicSpec<LeadersParams, LeadersData> = {
  type: 'stats-leaders',
  label: 'Season leaders',
  hint: 'The top players for one statistic.',
  parse(raw) {
    // metric | season (or "all") | grade category (or "default") | how many
    const p = sourceParts(raw, 4)
    if (!p || !/^[a-zA-Z]{2,20}$/.test(p[0]) || !isLabelToken(p[1]) || !/^[a-z]{3,10}$/.test(p[2]) || (p[3] !== '3' && p[3] !== '5')) return null
    return { metric: p[0], season: p[1], cat: p[2], count: p[3] === '3' ? 3 : 5 }
  },
  layout(d, _style, size) {
    if (!d.rows.length) return { blocks: [], empty: 'No one has qualified for this table yet.' }
    const rows: Row[] = d.rows.map((r) => ({ lead: String(r.rank), text: rowName(r.name, size), value: r.value, sub: size === 'landscape' ? undefined : r.context }))
    const cut = cutRows(rows, size, 0)
    return { blocks: [{ kind: 'kicker', text: [d.seasonLabel, d.scopeLabel].filter(Boolean).join('  |  ') }, { kind: 'headline', text: d.metric }, { kind: 'rows', rows: cut.rows, more: cut.more }] }
  },
  captionVars: (d) => ({ metric: d.metric, season: d.seasonLabel, grade: d.scopeLabel, leader: d.rows[0] ? `${d.rows[0].name} (${d.rows[0].value})` : '' }),
  describe: (d) => `${d.metric} leaders, ${d.seasonLabel}`,
}
