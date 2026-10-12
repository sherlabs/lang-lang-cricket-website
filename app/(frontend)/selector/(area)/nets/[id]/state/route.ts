import { getSelectionUser } from '@/lib/selector-auth'
import { getNetSnapshot } from '@/lib/nets-queries'

export const dynamic = 'force-dynamic'

const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const notFound = () => new Response('Not found', { status: 404, headers: { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } })

/**
 * The timer's state for one net session, for the selector's own browser to refetch when the tab comes back or after an action.
 * Anonymous visitors and unknown sessions get the same plain 404, and nothing is cached.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const selector = await getSelectionUser(req.headers)
  if (!selector) return notFound()
  const { id } = await params
  if (!/^\d{1,9}$/.test(id)) return notFound()
  const snapshot = await getNetSnapshot(selector, Number(id))
  if (!snapshot) return notFound()
  return new Response(JSON.stringify(snapshot), { status: 200, headers: HEADERS })
}
