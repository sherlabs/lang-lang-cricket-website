import type { RsvpResponse } from './rsvp-response'

/**
 * Admin "one option per line" text → clean list: trimmed, blanks dropped,
 * duplicates (case-insensitive) collapsed to their first spelling.
 */
export function normaliseMealOptions(input: string | string[]): string[] {
  const lines = Array.isArray(input) ? input : input.split(/\r?\n/)
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of lines) {
    const option = String(raw ?? '').trim()
    if (!option) continue
    const key = option.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(option)
  }
  return out
}

/** Defensive read — rows from before the column existed, or odd JSON, become "no options". */
export function eventMealOptions(event: { mealOptions?: unknown }): string[] {
  return Array.isArray(event.mealOptions) ? event.mealOptions.filter((o): o is string => typeof o === 'string' && !!o) : []
}

/** Empty is fine (no payment link); otherwise it must be an absolute http(s) URL. */
export function isValidPaymentUrl(value: string): boolean {
  if (!value) return true
  if (!/^https?:\/\//i.test(value)) return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/**
 * The one place the meal rule lives. Only matters when the person is coming and
 * the event offers dinner options: they must say whether they want dinner, and if
 * so pick one of the options. Stored `meal` is that option, or '' for "no dinner"
 * (there is no separate column — '' means no dinner). A "can't make it" never
 * carries a meal. Returns the meal to store, or an error message.
 */
export function resolveMeal(
  response: RsvpResponse,
  input: { dinner: string; meal: string },
  mealOptions: string[]
): { meal: string } | { error: string } {
  if (response === 'no' || mealOptions.length === 0) return { meal: '' }
  const dinner = input.dinner.trim()
  if (dinner === 'no') return { meal: '' }
  if (dinner !== 'yes') return { error: 'Please tell us whether you want dinner.' }
  const meal = input.meal.trim()
  if (!meal) return { error: 'Please choose a dinner option.' }
  if (!mealOptions.includes(meal)) return { error: 'That dinner option is not available.' }
  return { meal }
}
