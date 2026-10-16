/**
 * The only link targets a story renders (spec §5): http, https and mailto. Pure, so the public
 * renderer (a React component) and the conversion pipeline share it.
 */
export function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string') return false
  const h = href.trim()
  if (!/^(https?:|mailto:)/i.test(h)) return false
  try {
    const u = new URL(h)
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:'
  } catch {
    return false
  }
}
