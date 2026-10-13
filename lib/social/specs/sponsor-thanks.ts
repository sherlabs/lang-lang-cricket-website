import type { GraphicSpec } from '../types'
import { cleanText } from '../types'
import { fillNames } from '../fit'
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
  layout(d, _style, size) {
    if (!d.sponsors.length) return { blocks: [], empty: 'No sponsors were found.' }
    const one = d.sponsors.length === 1
    // A sponsor with no logo we can draw is shown by name, in large type: never a grey tile or an initial.
    // The wide page is short: when logos and names share it, the level is shown only on the names, to leave room for both.
    const crowded = size === 'landscape' && d.sponsors.some((s) => !s.logo) && d.sponsors.some((s) => s.logo)
    const withLogo = d.sponsors.flatMap((s) => (s.logo ? [{ src: s.logo, name: one ? '' : s.name, ...(crowded ? {} : { tier: s.tier }) }] : []))
    const nameOnly = d.sponsors.flatMap((s) => (s.logo ? [] : [{ name: s.name, tier: s.tier }]))
    // The headline already names a single sponsor, so a single name-only sponsor adds no second block (its tier joins the kicker).
    const singleNameOnly = one && nameOnly.length === 1
    return {
      // The sponsors are the picture, so the footer strip (which would repeat them) is left off.
      noStrip: true,
      blocks: fillNames([
        { kind: 'kicker', text: singleNameOnly && nameOnly[0].tier ? `Thank you  |  ${nameOnly[0].tier}` : 'Thank you' },
        { kind: 'headline', text: one ? d.sponsors[0].name : 'To our sponsors' },
        ...(withLogo.length ? [{ kind: 'logos' as const, items: withLogo }] : []),
        ...(nameOnly.length && !singleNameOnly ? [{ kind: 'names' as const, items: nameOnly }] : []),
        ...(d.line ? [{ kind: 'text' as const, text: d.line }] : []),
      ], size, _style),
    }
  },
  // A tier is only named for a single sponsor: "a Gold sponsor" is wrong for two sponsors of different tiers (the line is then dropped).
  captionVars: (d) => ({ sponsor: joinNames(d.sponsors.map((s) => s.name)), tier: d.sponsors.length === 1 ? (d.sponsors[0].tier ?? '') : '' }),
  describe: (d) => `Thank you to ${joinNames(d.sponsors.map((s) => s.name))}`,
}
