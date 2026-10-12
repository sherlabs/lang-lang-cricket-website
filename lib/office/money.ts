/**
 * Money in the club office is integer cents (wave D spec section 1). Nothing here assumes a currency: the code and the language come
 * from the office settings (`OFFICE_CURRENCY` / `OFFICE_LOCALE` by default). Pure.
 */
export type MoneyFormat = { currency: string; locale: string }

/**
 * Money is stored as hundredths of the unit, so the currency must have exactly two decimals (AUD, NZD, GBP, USD, EUR, CAD, ZAR,
 * INR...). A zero-decimal (JPY) or three-decimal (KWD) currency would be wrong by 10 to 100 times, so it is refused. Uses the
 * runtime's ISO 4217 data; an unknown code is not accepted either. Pure.
 */
export function isTwoDecimalCurrency(code: unknown): boolean {
  if (typeof code !== 'string' || !/^[A-Za-z]{3}$/.test(code)) return false
  try {
    const o = new Intl.NumberFormat('en', { style: 'currency', currency: code.toUpperCase() }).resolvedOptions()
    return o.minimumFractionDigits === 2 && o.maximumFractionDigits === 2
  } catch {
    return false
  }
}

/** The largest single amount accepted anywhere in the office: one million in whole units. */
export const MAX_CENTS = 100_000_000

/** `1250` becomes "$12.50" (or the club's own currency and style). Falls back to a plain number if the currency code is unknown. */
export function formatMoney(cents: number, fmt: MoneyFormat): string {
  const value = (Number.isFinite(cents) ? cents : 0) / 100
  try {
    return new Intl.NumberFormat(fmt.locale, { style: 'currency', currency: fmt.currency }).format(value)
  } catch {
    return `${value.toFixed(2)} ${fmt.currency}`
  }
}

/**
 * What a person types in an amount box. Plain digits with an optional point and at most two decimals ("20", "12.5", "12.50");
 * a leading currency sign, spaces and thousands commas are tolerated. Negatives, zero, more than two decimals, anything that is
 * not a number and absurd sizes give null. Returns integer cents.
 */
export function parseMoney(text: unknown): number | null {
  if (typeof text !== 'string') return null
  const s = text.trim().replace(/^[^\d.,-]+/, '').replace(/\s/g, '')
  if (!s || s.startsWith('-')) return null
  const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s.replace(/,/g, '') : s
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(plain)
  if (!m) return null
  const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0)
  return cents > 0 && cents <= MAX_CENTS ? cents : null
}

/** An amount that may be zero (a tier rate): same rules as `parseMoney` but "0" and "" are allowed and give 0. */
export function parseRate(text: unknown): number | null {
  if (typeof text === 'string' && /^\s*0*(\.0{0,2})?\s*$/.test(text)) return 0
  return parseMoney(text)
}

/** Even split of `total` cents over `n` shares; the first shares take the odd cents so the parts always sum to the total. */
export function splitEvenly(total: number, n: number): number[] {
  if (!Number.isInteger(total) || total < 0 || !Number.isInteger(n) || n < 1) return []
  const base = Math.floor(total / n)
  const extra = total - base * n
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0))
}
