/** Pure helper for refused office form posts (see `admin-route.ts`). */
/** The admin page a form was posted from (same host only, under the admin route), as a path plus query, or null. */
export function refererInAdmin(referer: string | null, host: string | null, adminRoute: string): string | null {
  if (!referer || !host) return null
  try {
    const u = new URL(referer)
    if (u.host !== host || !(u.pathname === adminRoute || u.pathname.startsWith(`${adminRoute}/`))) return null
    u.searchParams.delete('notice')
    u.searchParams.delete('error')
    u.searchParams.delete('n')
    return `${u.pathname}${u.search}`
  } catch {
    return null
  }
}
