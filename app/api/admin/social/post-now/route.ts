import { getPayloadClient } from '@/lib/payload/client'
import { publishDue } from '@/lib/social/publisher'
import { notFound, PRIVATE_HEADERS, staffUser } from '@/lib/social/staff'
import { hit, type ThrottleRule } from '@/lib/throttle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Up to three networks at 20 seconds each, plus the picture render.
export const maxDuration = 120

/** 10 posts per 10 minutes per person, a one-minute pause: each call can take up to 20 seconds per network. */
export const POST_NOW_RULE: ThrottleRule = { limit: 10, windowMs: 600_000, lockMs: 60_000 }

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: PRIVATE_HEADERS })

/**
 * POST (committee only) `{ id }`: "Post now" for one scheduled post, whatever its time. It uses the publisher's id predicate (the post must
 * be `scheduled`; a draft, a posted row or one being sent is refused), not the cron route, and re-checks the approval and content like the cron.
 * Same-origin JSON only, so another site cannot make a signed-in committee member post.
 */
export async function POST(request: Request): Promise<Response> {
  const actor = await staffUser(request)
  if (actor === null) return notFound()
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(request.url).host) return notFound()
    } catch {
      return notFound()
    }
  }
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 415)
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof body?.id === 'number' && Number.isInteger(body.id) && body.id > 0 && body.id <= 2147483647 ? body.id : null
  if (id === null) return json({ ok: false, error: 'Something went wrong. Please try again.' }, 400)
  const payload = await getPayloadClient()
  const gate = await hit(payload, `social-postnow:${actor.id}`, POST_NOW_RULE)
  if (!gate.allowed) return json({ ok: false, error: 'Slow down for a minute, then try again.' }, 429)
  const summary = await publishDue(payload, { onlyId: id })
  if (summary.claimed.length === 0) return json({ ok: false, error: 'That post cannot be sent now. It may already be on its way or finished.' }, 409)
  return json({ ok: true, status: summary.claimed[0].status })
}
