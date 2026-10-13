/** Small number helpers shared by the insight functions. Pure: no database, no Next. */

export const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0)

/** Mean of the values, or null for none (never NaN). */
export const mean = (xs: readonly number[]): number | null => (xs.length ? sum(xs) / xs.length : null)

/** Median of the values, or null for none. An even count takes the mean of the middle two. */
export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** `value` when there are at least `min` samples, else null: the shared "below the minimum the rate is omitted" rule. */
export const needs = <T>(n: number, min: number, value: T): T | null => (n >= min ? value : null)

/** One decimal, trailing zero dropped ("34", "34.5"). */
export const fmt = (v: number | null, digits = 1): string => (v === null || !Number.isFinite(v) ? '–' : String(Number(v.toFixed(digits))))
