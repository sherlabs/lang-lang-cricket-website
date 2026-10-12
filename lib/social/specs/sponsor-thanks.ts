import type { GraphicSpec } from '../types'
import { cleanText } from '../types'
import { joinNames } from './helpers'

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
  layout(d) {
    if (!d.sponsors.length) return { blocks: [], empty: 'No sponsors were found.' }
    const one = d.sponsors.length === 1
    return {
      // The sponsors are the picture, so the footer strip (which would repeat them) is left off.
      noStrip: true,
      blocks: [
        { kind: 'kicker', text: 'Thank you' },
        { kind: 'headline', text: one ? d.sponsors[0].name : 'To our sponsors' },
        { kind: 'logos', items: d.sponsors.map((s) => ({ src: s.logo, name: one ? '' : s.name, tier: s.tier })) },
        ...(d.line ? [{ kind: 'text' as const, text: d.line }] : []),
      ],
    }
  },
  // A tier is only named for a single sponsor: "a Gold sponsor" is wrong for two sponsors of different tiers (the line is then dropped).
  captionVars: (d) => ({ sponsor: joinNames(d.sponsors.map((s) => s.name)), tier: d.sponsors.length === 1 ? (d.sponsors[0].tier ?? '') : '' }),
  describe: (d) => `Thank you to ${joinNames(d.sponsors.map((s) => s.name))}`,
}
