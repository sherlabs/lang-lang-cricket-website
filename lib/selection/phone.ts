import { CLUB_COUNTRY } from '@/config/site'

/**
 * Phone numbers for the selectors' contact list (announce-teams spec 4.2). A phone is personal information: it is stored as
 * digits only, shown to selection users only and never logged. The rules are a small per-country table keyed by `CLUB_COUNTRY`;
 * a country with no entry gets a permissive digits-only rule, so a club anywhere can use the feature.
 */
type CountryRule = { dial: string; trunk: string; lengths: number[]; group: number[] }

const COUNTRIES: Record<string, CountryRule> = {
  AU: { dial: '61', trunk: '0', lengths: [10], group: [4, 3, 3] },
  NZ: { dial: '64', trunk: '0', lengths: [9, 10, 11], group: [3, 3, 4] },
  GB: { dial: '44', trunk: '0', lengths: [10, 11], group: [5, 6] },
  IN: { dial: '91', trunk: '0', lengths: [10], group: [5, 5] },
  ZA: { dial: '27', trunk: '0', lengths: [10], group: [3, 3, 4] },
}

/** The phone as digits in the national format of `country`, or null when it is not a plausible number. */
export function normalisePhone(raw: string | null | undefined, country: string = CLUB_COUNTRY): string | null {
  if (typeof raw !== 'string' || raw.length > 40) return null
  let digits = raw.replace(/[^\d+]/g, '')
  const international = digits.startsWith('+') || digits.startsWith('00')
  digits = digits.replace(/\D/g, '')
  if (international && digits.startsWith('00')) digits = digits.slice(2)
  const rule = COUNTRIES[country.toUpperCase()]
  if (!rule) return digits.length >= 6 && digits.length <= 15 ? digits : null
  // +61 400 000 001 or 61400000001 become 0400000001.
  if (digits.startsWith(rule.dial) && (international || !digits.startsWith(rule.trunk))) {
    const rest = digits.slice(rule.dial.length)
    if (rest.length > 0) digits = rule.trunk + rest.replace(/^0+/, '')
  }
  if (!digits.startsWith(rule.trunk)) digits = rule.trunk + digits
  return rule.lengths.includes(digits.length) ? digits : null
}

/** "0400 000 001" for a known country, plain digits otherwise. */
export function formatPhone(digits: string, country: string = CLUB_COUNTRY): string {
  const rule = COUNTRIES[country.toUpperCase()]
  if (!rule || digits.length !== rule.group.reduce((a, b) => a + b, 0)) return digits
  const parts: string[] = []
  let i = 0
  for (const n of rule.group) {
    parts.push(digits.slice(i, i + n))
    i += n
  }
  return parts.join(' ')
}

/** The last four digits (the default PIN of the issue), or null for a number with fewer than four. */
export const lastFour = (digits: string | null | undefined): string | null => (digits && digits.length >= 4 ? digits.slice(-4) : null)

/** `tel:` href for a stored phone, or null. */
export const telHref = (digits: string | null | undefined): string | null => (digits ? `tel:${digits}` : null)
