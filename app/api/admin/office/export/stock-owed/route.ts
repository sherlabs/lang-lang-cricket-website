import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { auditedExport } from '@/lib/office/export'
import { currentClubDate } from '@/lib/selection/club-date'
import { slugify } from '@/lib/slugify'
import { OWED_EXPORT_SUMMARY_SPEC, owedExportTable } from '@/lib/stock-office-queries'

export const dynamic = 'force-dynamic'

/**
 * POST (admin only): who still holds club kit, as CSV. It has names, so an editor gets a 403 and every download is logged in the
 * exports and sends log (no names in the log row). Any cell a spreadsheet could read as a formula is neutralised by the shared writer.
 */
export async function POST(request: Request): Promise<Response> {
  const club = await getClub()
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName) || 'club'
  return auditedExport({
    request,
    module: 'stock',
    filename: `${prefix}-kit-owed-back-${currentClubDate()}.csv`,
    summarySpec: OWED_EXPORT_SUMMARY_SPEC,
    plan: (_form, { user }) => ({ filterSummary: { scope: 'owed' }, includeSensitive: false, build: () => owedExportTable(user) }),
  })
}
