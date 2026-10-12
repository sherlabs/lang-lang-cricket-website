import { sql } from '@payloadcms/db-postgres/drizzle'
import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { getPayloadClient } from '@/lib/payload/client'
import type { PostSpec } from '@/lib/social/post-spec'
import { renderFromSpec } from '@/lib/social/spec-render'
import { notFound, PRIVATE_HEADERS, renderAllowed, staffUser } from '@/lib/social/staff'
import { isSizeKey } from '@/lib/social/types'
import { slugify } from '@/lib/slugify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET (committee only): the picture of a queued post, drawn from its saved snapshot, for the "download and post it by hand" fallback
 * (wave C spec 4.8). `post`, `size`, and `download=1` for an attachment named from config and the picture's own parts.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await staffUser(request)
  if (actor === null) return notFound()
  const url = new URL(request.url)
  const id = url.searchParams.get('post') ?? ''
  const size = url.searchParams.get('size') ?? ''
  if (!/^\d{1,12}$/.test(id) || !isSizeKey(size)) return notFound()
  const gate = await renderAllowed(actor.id)
  if (!gate.allowed) return new Response('Slow down for a minute', { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': String(Math.max(1, gate.retryAfterSeconds)), ...PRIVATE_HEADERS } })
  const payload = await getPayloadClient()
  const res = (await payload.db.drizzle.execute(sql`SELECT spec FROM "payload"."social_posts" WHERE id = ${Number(id)}`)) as unknown as { rows: { spec: PostSpec }[] }
  const spec = res.rows[0]?.spec
  if (!spec) return notFound()
  const club = await getClub()
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName || club.name) || 'club'
  const headers: Record<string, string> = { ...PRIVATE_HEADERS }
  if (url.searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="${prefix}-${spec.type}-${size}-${new Date().toISOString().slice(0, 10)}.png"`
  return (await renderFromSpec(spec, size, headers)) ?? notFound()
}
