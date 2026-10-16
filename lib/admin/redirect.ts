import { getSafeRedirect } from 'payload/shared'

/**
 * Where a signed-out visitor to a custom admin view is sent, and how they come back (wave G WP-0).
 *
 * The target is built only from things the server controls: the admin route from config, the view's own fixed path and an allowlisted
 * re-serialisation of the parsed query. It never reads `x-url`, `next-url`, `Referer` or any other header a visitor can shape, and
 * the result is passed through Payload's `getSafeRedirect` as a second gate. Flash keys such as `notice` and `error` are not
 * allowlisted anywhere, so a message never outlives the sign-in.
 */

type Query = Record<string, string | string[] | undefined> | undefined

const VALUE_MAX = 500
const TOTAL_MAX = 2000

/** The query keys a view puts in its address (anything else is dropped from the way back). Longest matching view path wins. */
export const VIEW_QUERY_KEYS: ReadonlyArray<readonly [path: string, keys: readonly string[]]> = [
  ['/social', ['type', 'source', 'style', 'size', 'text', 'tab', 'post']],
  ['/office/fees', ['season', 'view', 'owing']],
  ['/office/diary', ['season', 'filter']],
  ['/office/email', ['q', 'page']],
  ['/office/stock', ['tab', 'q', 'show']],
  ['/office/volunteers', ['season', 'from', 'to']],
]

export function queryKeysFor(viewPath: string): readonly string[] {
  const hit = [...VIEW_QUERY_KEYS].sort((a, b) => b[0].length - a[0].length).find(([p]) => viewPath === p || viewPath.startsWith(`${p}/`))
  return hit ? hit[1] : []
}

const clean = (v: string): string => [...v].filter((c) => { const n = c.charCodeAt(0); return n > 31 && n !== 127 }).join('').slice(0, VALUE_MAX)

/** `?a=1&b=2` (or '') from the allowlisted keys of a parsed query, each value capped, the whole capped. */
export function allowlistedQuery(query: Query, keys: readonly string[]): string {
  if (!query) return ''
  const out = new URLSearchParams()
  for (const key of keys) {
    const raw = query[key]
    const value = clean(Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? ''))
    if (value) out.set(key, value)
  }
  const text = out.toString()
  return text && text.length <= TOTAL_MAX ? `?${text}` : ''
}

/** The path (plus allowlisted query) to come back to after signing in, always inside the admin. */
export function adminReturnPath(opts: { adminRoute: string; viewPath: string; query?: Query; keys?: readonly string[] }): string {
  const home = getSafeRedirect({ redirectTo: opts.adminRoute || '/admin', fallbackTo: '/admin' })
  const path = `${home}${opts.viewPath.startsWith('/') ? opts.viewPath : `/${opts.viewPath}`}`
  // A view path is a constant, but a path that climbs out of the admin, doubles a slash or has a backslash is never followed.
  if (/(^|\/)\.\.?(\/|$)|\/\/|\\/.test(path)) return home
  const candidate = `${path}${allowlistedQuery(opts.query, opts.keys ?? queryKeysFor(opts.viewPath))}`
  return getSafeRedirect({ redirectTo: candidate, fallbackTo: home })
}

/** `/admin/login?redirect=<return path>`. */
export function loginRedirectUrl(opts: { adminRoute: string; loginPath?: string; viewPath: string; query?: Query; keys?: readonly string[] }): string {
  const home = getSafeRedirect({ redirectTo: opts.adminRoute || '/admin', fallbackTo: '/admin' })
  const back = adminReturnPath(opts)
  return `${home}${opts.loginPath ?? '/login'}?redirect=${encodeURIComponent(back)}`
}
