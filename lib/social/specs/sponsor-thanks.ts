import type { GraphicSpec } from '../types'
import { cleanText } from '../types'

export type SponsorThanksData = { sponsors: { name: string; tier: string; logo: string | null }[]; line: string }
export type SponsorThanksParams = { ids: number[]; text: string }

export const sponsorThanksSpec: GraphicSpec<SponsorThanksParams, SponsorThanksData> = {
  type: 'sponsor-thanks',
  label: 'Sponsor thank-you',
  hint: 'Thank one or more sponsors, with their logos.',
  parse(raw) {
    const s = raw.source
    if (typeof s !== 'string' || !/^[0-9]{1,12}(,[0-9]{1,12}){0,3}$/.test(s)) return null
    return { ids: [...new Set(s.split(',').map(Number))], text: cleanText(raw.text) }
  },
  layout(d, _style, size) {
    if (!d.sponsors.length) return { blocks: [], empty: 'No sponsors were found.' }
    const one = d.sponsors.length === 1
    const shown = size === 'landscape' ? d.sponsors.slice(0, 3) : d.sponsors
    return {
      blocks: [
        { kind: 'kicker', text: 'Thank you' },
        { kind: 'headline', text: one ? d.sponsors[0].name : 'To our sponsors' },
        { kind: 'logos', items: shown.map((s) => ({ src: s.logo, name: one ? '' : s.name, tier: s.tier })) },
        ...(d.line ? [{ kind: 'text' as const, text: d.line }] : []),
      ],
    }
  },
  captionVars: (d) => ({ sponsor: d.sponsors.map((s) => s.name).join(', '), tier: d.sponsors[0]?.tier ?? '' }),
  describe: (d) => `Thank you to ${d.sponsors.map((s) => s.name).join(', ')}`,
}
