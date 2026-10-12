import { EXPORT_FILENAME_PREFIX } from '@/config/site'
import { getClub } from '@/lib/club'
import { EXPORT_SUMMARY_SPEC, membersForExport } from '@/lib/members-queries'
import { auditedExport } from '@/lib/office/export'
import { auditFilterSummary, parseMemberQuery } from '@/lib/office/member-filters'
import { currentClubDate } from '@/lib/selection/club-date'
import { slugify } from '@/lib/slugify'

export const dynamic = 'force-dynamic'

/**
 * POST (admin only): the members list as CSV for the current filter. Date of birth, emergency contact and notes are left out unless
 * the form's tick is set; the tick is recorded in the audit row. The filter comes from the form fields through the same parser as
 * the page, so only known keys and values reach a query.
 */
export async function POST(request: Request): Promise<Response> {
  const club = await getClub()
  const prefix = EXPORT_FILENAME_PREFIX || slugify(club.shortName) || 'club'
  return auditedExport({
    request,
    module: 'members',
    filename: `${prefix}-members-${currentClubDate()}.csv`,
    summarySpec: EXPORT_SUMMARY_SPEC,
    plan: (form, { payload, user }) => {
      const fields: Record<string, string> = {}
      for (const [k, v] of form?.entries() ?? []) if (typeof v === 'string') fields[k] = v
      const query = parseMemberQuery(fields)
      const includeSensitive = fields.sensitive === 'yes'
      return { filterSummary: auditFilterSummary(query), includeSensitive, build: () => membersForExport(payload, user, query, includeSensitive) }
    },
  })
}
