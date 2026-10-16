import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { FEE_EXPORT_SUMMARY_SPEC, feeExportTable } from '@/lib/fees-office-queries'
import { auditedExport } from '@/lib/office/export'
import { isSeasonName, seasonOfClubDate, seasonStartYearOfName } from '@/lib/office/season'
import { currentClubDate } from '@/lib/selection/club-date'
import { slugify } from '@/lib/slugify'

export const dynamic = 'force-dynamic'

/**
 * POST (admin only): the fees report for one season as CSV. Never includes date of birth, emergency contact or notes. The detail
 * block (one row per charge) is behind a tick. The audit row records the season's start year and whether detail was included.
 */
export async function POST(request: Request): Promise<Response> {
  const club = await getClub()
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName) || 'club'
  return auditedExport({
    request,
    module: 'fees',
    filename: `${prefix}-fees-${currentClubDate()}.csv`,
    summarySpec: FEE_EXPORT_SUMMARY_SPEC,
    plan: (form, { user }) => {
      const given = form?.get('season')
      const season = typeof given === 'string' && isSeasonName(given) ? given : seasonOfClubDate(currentClubDate()).name
      const detail = form?.get('detail') === 'yes'
      return { filterSummary: { seasonStartYear: seasonStartYearOfName(season) ?? 0, detail, households: false }, includeSensitive: false, build: () => feeExportTable(user, season, detail) }
    },
  })
}
