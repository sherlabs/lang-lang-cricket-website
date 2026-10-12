/**
 * No card data anywhere in the club office (wave D spec section 1). Free-text fields that people might paste a payment reference
 * into refuse anything that looks like a card number: a run of 13 to 19 digits (spaces and dashes allowed between digits) that
 * passes the Luhn check. Pure.
 */
function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

export function looksLikeCardNumber(text: string | null | undefined): boolean {
  if (!text) return false
  for (const run of text.match(/\d[\d -]*\d/g) ?? []) {
    const digits = run.replace(/\D/g, '')
    if (digits.length < 13) continue
    if (digits.length <= 19) {
      if (luhn(digits)) return true
      continue
    }
    // A longer run is checked in 13 to 19 digit windows, so padding a number with extra digits does not hide it.
    for (let len = 13; len <= 19; len++) {
      for (let start = 0; start + len <= digits.length; start++) if (luhn(digits.slice(start, start + len))) return true
    }
  }
  return false
}

/** Payload field `validate` for a free-text field: refuses card-shaped numbers. */
export const noCardNumbers = (value: unknown): true | string =>
  typeof value === 'string' && looksLikeCardNumber(value) ? 'This looks like a card number. Never type card details here.' : true
