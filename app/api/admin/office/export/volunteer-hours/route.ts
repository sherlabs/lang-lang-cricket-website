import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { auditedExport } from '@/lib/office/export'
import { isSeasonName, seasonOfClubDate, seasonStartYearOfName } from '@/lib/office/season'
import { currentClubDate } from '@/lib/selection/club-date'
import { slugify } from '@/lib/slugify'
import { HOURS_EXPORT_SPEC, hoursExportTable } from '@/lib/volunteers-office-queries'

export const dynamic = 'force-dynamic'

/**
 * POST (admin only): the volunteer hours as CSV, either the name-free aggregate (small groups hidden, for grant applications) or one
 * row per person. Never includes date of birth, emergency contact or notes. The audit row records the scope and the season start year.
 */
export async function POST(request: Request): Promise<Response> {
  const club = await getClub()
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName) || 'club'
  return auditedExport({
    request,
    module: 'volunteers',
    filename: `${prefix}-volunteer-hours-${currentClubDate()}.csv`,
    summarySpec: HOURS_EXPORT_SPEC,
    plan: (form, { user }) => {
      const get = (k: string): string => (typeof form?.get(k) === 'string' ? (form!.get(k) as string) : '')
      const scope = get('scope') === 'person' ? 'person' : 'aggregate'
      const dates = /^\d{4}-\d{2}-\d{2}$/.test(get('from')) && /^\d{4}-\d{2}-\d{2}$/.test(get('to'))
      const season = isSeasonName(get('season')) ? get('season') : seasonOfClubDate(currentClubDate()).name
      const query = dates ? { from: get('from'), to: get('to') } : { season }
      return { filterSummary: { scope, seasonStartYear: seasonStartYearOfName(season) ?? 0, range: dates ? 'dates' : 'season' }, includeSensitive: false, build: () => hoursExportTable(user, query, scope) }
    },
  })
}
