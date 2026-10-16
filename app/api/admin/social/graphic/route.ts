import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { loadGraphic, renderLoaded } from '@/lib/social/pipeline'
import { notFound, parseCommon, PRIVATE_HEADERS, renderAllowed, staffUser } from '@/lib/social/staff'
import { slugify } from '@/lib/slugify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A cold render loads fonts, the crest and sponsor logos: allow it room.
export const maxDuration = 30

/**
 * GET (committee only): one social graphic as a PNG, drawn from live visible data. `type`, `size` (square, story, landscape), `style`
 * (bold, classic, minimal; the club default when absent) and `source` choose it; `text` is an optional line of words (80 characters).
 * `download=1` adds a file name made from config and the picture's own parts, never from typed text.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await staffUser(request)
  if (actor === null) return notFound()
  const url = new URL(request.url)
  const common = parseCommon(url)
  if (!common) return notFound()
  const gate = await renderAllowed(actor.id)
  if (!gate.allowed) {
    return new Response('Slow down for a minute', { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': String(Math.max(1, gate.retryAfterSeconds)), ...PRIVATE_HEADERS } })
  }
  const loaded = await loadGraphic(common.type, common.raw)
  if (!loaded) return notFound()
  const club = await getClub()
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName || club.name) || 'club'
  const date = new Date().toISOString().slice(0, 10)
  const headers: Record<string, string> = { ...PRIVATE_HEADERS }
  if (url.searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="${prefix}-${common.type}-${common.size}-${date}.png"`
  return renderLoaded(loaded, common.size, common.style, headers)
}
