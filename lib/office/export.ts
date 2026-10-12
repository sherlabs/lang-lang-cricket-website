import 'server-only'
import type { Payload, TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { toCsv, type CsvCell } from '@/lib/stats/csv'
import { isAdminUser, isSignedIn } from '@/payload/access'
import { sanitiseSummary, type SummarySpec } from './audit'
import { writeAudit } from './audit-write'
import { exportOriginOk } from './export-gate'

export type ExportTable = { header: readonly string[]; rows: readonly (readonly CsvCell[])[] }

/**
 * Every office CSV goes through here (wave D spec section 1): POST only, a signed-in admin, a same-origin request, an audit row
 * written before one byte is sent, `toCsv` (the existing formula-safe writer) and `no-store`. `plan` runs only after the checks, so a
 * refused caller never causes a query. `includeSensitive` is recorded in the audit row; what it adds to the table is up to `build`.
 */
export async function auditedExport(opts: {
  request: Request
  module: string
  filename: string
  summarySpec: SummarySpec
  /** Called after the checks with the posted form: turns it into the filter summary, the sensitive tick and the table builder. */
  plan: (form: FormData | null, ctx: { payload: Payload; user: TypedUser }) => { filterSummary: Record<string, unknown>; includeSensitive: boolean; build: () => Promise<ExportTable> }
}): Promise<Response> {
  const { request } = opts
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST' } })
  const payload = await getPayloadClient()
  if (!exportOriginOk({ origin: request.headers.get('origin'), secFetchSite: request.headers.get('sec-fetch-site'), csrf: payload.config.csrf as string[] })) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { user } = await payload.auth({ headers: request.headers })
  if (!isSignedIn(user)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdminUser(user)) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const form = await request.formData().catch(() => null)
  const plan = opts.plan(form, { payload, user: user as TypedUser })
  const table = await plan.build()
  await writeAudit(payload, {
    userId: (user as TypedUser).id,
    action: 'export',
    module: opts.module,
    summary: sanitiseSummary(plan.filterSummary, opts.summarySpec),
    rowCount: table.rows.length,
    includedSensitive: plan.includeSensitive,
  })
  return new Response(toCsv(table.header, table.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${opts.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  })
}
