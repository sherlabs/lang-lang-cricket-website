import { runBatchFor } from '@/lib/email-office-queries'
import { sendingCampaignIds, purgeExpiredRecipients } from '@/lib/email/campaign'
import { CRON_BUDGET_SECONDS, emailEnabled } from '@/lib/email/env'
import { resolveOfficeSettings } from '@/lib/office/settings'
import { getPayloadClient } from '@/lib/payload/client'
import { cronAuthorized } from '@/lib/social/cron-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** Stop starting new batches after this long, so the function ends inside its time limit. */
const BUDGET_MS = CRON_BUDGET_SECONDS * 1000

/**
 * The scheduled mail run (once a day, see vercel.json; about `sendEstimate().perRun` sends per run, so a big email left alone takes days): `Authorization: Bearer $CRON_SECRET` (constant-time compare, an unset secret never matches). It carries on
 * sending any email that is still going, then blanks the recipient addresses of finished
 * emails past the retention period. With email off it answers 404 and does nothing at all.
 */
export async function GET(request: Request): Promise<Response> {
  if (!emailEnabled()) return new Response('Not found', { status: 404 })
  if (!cronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('Unauthorized', { status: 401 })
  const payload = await getPayloadClient()
  const started = Date.now()
  let batches = 0
  let sent = 0
  for (const id of await sendingCampaignIds(payload)) {
    while (Date.now() - started < BUDGET_MS) {
      const r = await runBatchFor(id)
      if (!r) break
      batches += 1
      sent += r.sent
      if (r.remaining === 0 || r.stopped || r.processed === 0) break
    }
  }
  const doc = await payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null)
  const purged = await purgeExpiredRecipients(payload, resolveOfficeSettings(doc).email.retentionDays)
  return Response.json({ batches, sent, purgedCampaigns: purged.campaigns })
}
