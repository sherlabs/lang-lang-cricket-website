import { BRAND_KEYS } from './tokens'
import type { ResolvedTheme } from './resolve'

/**
 * The `:root` variable block: twelve `--brand-<key>: R G B` channel triples. Only digits and spaces from
 * a validated hex ever reach the string (`resolveTheme` falls back to the seed for anything invalid), so it
 * is safe to inline in a <style> element.
 */
export function themeCss(theme: Pick<ResolvedTheme, 'channels'>): string {
  const decls = Object.entries(themeCssVars(theme)).map(([name, triple]) => `${name}:${triple}`)
  return `:root{${decls.join(';')}}`
}

/**
 * The same twelve variables as an object, for an inline `style` on <html> (the admin: Payload's RootLayout owns
 * <head> and streams its body, so a <style> sibling is not in the first HTML; an attribute on <html> always is).
 */
export function themeCssVars(theme: Pick<ResolvedTheme, 'channels'>): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const k of BRAND_KEYS) {
    const triple = theme.channels[k]
    if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(triple)) throw new Error(`Bad channel triple for ${k}`)
    vars[`--brand-${k}`] = triple
  }
  return vars
}
