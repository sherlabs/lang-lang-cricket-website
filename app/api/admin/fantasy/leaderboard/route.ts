import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { leaderboardCsv } from '@/lib/fantasy/csv'
import { computeLeaderboard } from '@/lib/fantasy/queries'
import { getViewedSeason } from '@/lib/fantasy/store'
import { getPayloadClient } from '@/lib/payload/client'
import { requireStaff } from '@/lib/payload/staff-route'
import { slugify } from '@/lib/slugify'
import { isAdminUser } from '@/payload/access'

export const dynamic = 'force-dynamic'

/**
 * GET (admin only): the season leaderboard as CSV. Team names are typed by the public, so every cell goes through the shared
 * formula-injection guard. Never PINs, hashes or squads. The file name comes from config.
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await requireStaff(request)
  if ('response' in gate) return gate.response
  if (!isAdminUser(gate.user)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const payload = await getPayloadClient()
  const season = await getViewedSeason(payload)
  if (!season) return Response.json({ error: 'No season' }, { status: 404 })
  const lb = await computeLeaderboard(payload, season, { includeDisabled: false })
  const club = await getClub()
  const body = leaderboardCsv(lb.rows.map((r) => ({ rank: r.rank, teamName: r.teamName, total: r.total, best: r.best, rounds: r.rounds.filter((x) => !x.provisional).length, joined: r.joinedAt.slice(0, 10) })))
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName) || 'club'
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${prefix}-fantasy-${season.seasonStartYear}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
