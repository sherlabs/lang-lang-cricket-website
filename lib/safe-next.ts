/**
 * Where to go after sign-in. Only a path inside the selector area is ever honoured (no open redirect). The value is normalised
 * first (percent-decoded once; if a second decode would change it again it was double-encoded and is refused), then must be
 * exactly `/selector` or `/selector/...` made of plain path characters and an optional plain query.
 */
export const SELECTOR_HOME = '/selector'
const PLAIN = /^[A-Za-z0-9\-._~/?=&]*$/

export function safeNext(raw: unknown, fallback: string = SELECTOR_HOME): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 300) return fallback
  let once: string
  try {
    once = decodeURIComponent(raw)
    if (decodeURIComponent(once) !== once) return fallback
  } catch {
    return fallback
  }
  // Control characters (including those a %00 to %1f decodes to), backslashes and protocol-relative starts.
  if (/[\u0000-\u001f\u007f\\]/.test(once) || once.includes('//')) return fallback
  if (!PLAIN.test(once)) return fallback
  if (!(once === SELECTOR_HOME || once.startsWith(`${SELECTOR_HOME}/`) || once.startsWith(`${SELECTOR_HOME}?`))) return fallback
  if (once.split('?')[0].split('/').includes('..')) return fallback
  return once
}
