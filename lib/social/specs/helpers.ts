import { cleanText, isGameId, isIsoDate, isNumericId, isSafeId, type RawParams } from '../types'

/** The `source` query value split on `|` into exactly `n` parts, or null. */
export function sourceParts(raw: RawParams, n: number): string[] | null {
  const s = raw.source
  if (typeof s !== 'string' || s.length > 160) return null
  const parts = s.split('|')
  return parts.length === n ? parts : null
}

export const freeText = (raw: RawParams): string => cleanText(raw.text)

export { isGameId, isIsoDate, isNumericId, isSafeId }

/** Text for a season or grade name in a source id: letters, digits, spaces and a few separators. */
export const isLabelToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9 /_.&'-]{1,60}$/.test(v)

/** `A`, `A and B`, `A, B and C`. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
