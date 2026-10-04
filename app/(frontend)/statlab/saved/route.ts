import { APIError } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { requireStaff } from '@/lib/payload/staff-route'
import { droppedColumns, MAX_SAVED_REPORTS, savedReportHref } from '@/lib/stats/saved-reports'

// Admin-only bookmarks of StatLab tables (W2 spec 5.3). A route handler rather than page code keeps
// `/statlab` itself static (ISR): the page asks this route who is looking. It never caches, never
// indexes, and answers 401/403 to everyone but an admin, so a signed-out visitor sees no list.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers })

export async function GET(request: Request): Promise<Response> {
  const gate = await requireStaff(request)
  if ('response' in gate) return json({ error: 'Not signed in' }, 401)
  if (gate.user.role !== 'admin') return json({ error: 'Admins only' }, 403)
  const payload = await getPayloadClient()
  const { docs } = await payload.find({ collection: 'saved-reports', limit: MAX_SAVED_REPORTS, depth: 0, sort: 'title', user: gate.user, overrideAccess: false })
  return json({
    reports: docs.map((d) => ({ id: d.id, title: d.title, description: d.description ?? '', href: savedReportHref(d.query), dropped: droppedColumns(d.query) })),
  })
}

export async function POST(request: Request): Promise<Response> {
  const gate = await requireStaff(request)
  if ('response' in gate) return gate.response
  if (gate.user.role !== 'admin') return json({ error: 'Admins only' }, 403)
  const body = (await request.json().catch(() => null)) as { title?: unknown; query?: unknown; description?: unknown } | null
  if (!body || typeof body.title !== 'string' || typeof body.query !== 'string') return json({ error: 'A title and a report are needed.' }, 400)
  const payload = await getPayloadClient()
  try {
    const doc = await payload.create({
      collection: 'saved-reports',
      data: { title: body.title, query: body.query, ...(typeof body.description === 'string' && body.description ? { description: body.description } : {}) },
      user: gate.user, overrideAccess: false, depth: 0,
    })
    return json({ report: { id: doc.id, title: doc.title, href: savedReportHref(doc.query) } }, 201)
  } catch (err) {
    if (err instanceof APIError && err.status < 500) return json({ error: err.message }, err.status)
    // Field validation errors (for example a title that is too long) arrive as a ValidationError, also 400.
    const status = (err as { status?: number }).status ?? 500
    if (status < 500) return json({ error: 'That report could not be saved. Check the title (80 characters at most).' }, status)
    throw err
  }
}
