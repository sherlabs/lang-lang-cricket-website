import 'server-only'
import { headers as nextHeaders } from 'next/headers'
import { redirect } from 'next/navigation'
import type { TypedUser } from 'payload'
import { selectorPaths } from '@/config/site'
import { isSelectionUser } from '@/payload/access'
import { getPayloadClient } from '@/lib/payload/client'
import { safeNext } from '@/lib/safe-next'

/**
 * Who is looking at a `/selector` page. `payload.auth` ignores a cookie on a request that carries no Origin and no
 * `Sec-Fetch-Site: same-origin|same-site|none` (its CSRF rule, because `csrf` is set). A browser navigation that began on another
 * site (a link tapped in Messenger, the redirect back from Facebook) is `cross-site`, which would make a signed-in selector look
 * signed out. A page render is a GET whose response a foreign site cannot read, so for a request WITHOUT an `Origin` header
 * (browsers always send one on a POST and on any cross-origin fetch) the navigation signal is set to same-origin. A request
 * that carries an Origin is left exactly as it came, so a cross-site POST still has its cookie ignored.
 */
export function pageAuthHeaders(incoming: Headers): Headers {
  const h = new Headers(incoming)
  if (!h.get('origin')) h.set('sec-fetch-site', 'same-origin')
  return h
}

/** The signed-in admin, editor or selector (never a disabled one), or null. */
export async function getSelectionUser(incoming?: Headers): Promise<TypedUser | null> {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: pageAuthHeaders(incoming ?? (await nextHeaders())) })
  return isSelectionUser(user) ? user : null
}

/**
 * Every `/selector` page and server action calls this first (a Next server action is a public POST). Not signed in as a
 * selection user: redirect to the login page, carrying where they were going.
 */
export async function requireSelection(next: string = selectorPaths.home): Promise<TypedUser> {
  const user = await getSelectionUser()
  if (!user) redirect(`${selectorPaths.login}?next=${encodeURIComponent(safeNext(next))}`)
  return user
}
