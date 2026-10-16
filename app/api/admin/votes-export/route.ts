import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { requireStaff } from '@/lib/payload/staff-route'
import { slugify } from '@/lib/slugify'
import { exportVotesCsv } from '@/lib/selector-votes-queries'

export const dynamic = 'force-dynamic'

/**
 * GET (admin only): the season's best-player totals per player as CSV. Never individual ballots. The scope and season come from a
 * whitelist (digits only), the file name from config, so no user input reaches the response header.
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await requireStaff(request)
  if ('response' in gate) return gate.response
  const url = new URL(request.url)
  const seasonRaw = url.searchParams.get('season') ?? ''
  const season = /^\d{4}$/.test(seasonRaw) ? Number(seasonRaw) : null
  const grade = url.searchParams.get('grade')
  const club = await getClub()
  const out = await exportVotesCsv(gate.user, { season, gradeId: grade && grade.length <= 120 ? grade : null, locale: club.locale })
  // Editors are staff but this export is admin only: the same refusal as any other forbidden caller.
  if (!out) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName) || 'club'
  return new Response(out.body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${prefix}-${out.slug}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
