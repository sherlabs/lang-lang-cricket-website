import { sql } from '@payloadcms/db-postgres/drizzle'
import { getPayloadClient } from '@/lib/payload/client'
import { imageServable, verifyImageRequest } from '@/lib/social/image-url'
import type { PostSpec } from '@/lib/social/post-spec'
import { renderFromSpec } from '@/lib/social/spec-render'
import { notFound, PRIVATE_HEADERS } from '@/lib/social/staff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET (signed link, no login): the approved picture of a queued post, for a network to fetch (wave C spec 4.7). The signature is
 * checked FIRST, before any database lookup, so there is no timing difference between real and made-up post ids. After that the
 * post must still be servable (scheduled or sending, or just finished, within the grace period) and the revision must match, so an
 * edit kills old links. Every failure is the same plain 404. The picture is drawn from the saved snapshot, never from live data.
 */
export async function GET(request: Request, ctx: { params: Promise<{ postId: string; size: string }> }): Promise<Response> {
  const { postId, size } = await ctx.params
  const q = new URL(request.url).searchParams
  const claims = verifyImageRequest({ postId, size, rev: q.get('rev'), exp: q.get('exp'), sig: q.get('sig') })
  if (!claims) return notFound()
  const payload = await getPayloadClient()
  const res = (await payload.db.drizzle.execute(sql`SELECT status, revision, finished_at, spec FROM "payload"."social_posts" WHERE id = ${claims.postId}`)) as unknown as { rows: Record<string, unknown>[] }
  const row = res.rows[0]
  if (!row) return notFound()
  const post = { status: String(row.status), revision: Number(row.revision), finishedAt: row.finished_at ? new Date(String(row.finished_at)) : null }
  if (!imageServable(post, claims)) return notFound()
  const image = await renderFromSpec(row.spec as PostSpec, claims.size, { ...PRIVATE_HEADERS })
  return image ?? notFound()
}
