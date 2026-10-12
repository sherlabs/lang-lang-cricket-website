import 'server-only'
import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { getClub } from '@/lib/club'
import { currentClubDate } from '@/lib/selection/club-date'
import { getTheme } from '@/lib/theme'
import { memberWhere } from '@/lib/office/member-filters'
import { memberIsJunior } from '@/lib/office/members'
import { resolveOfficeSettings, type EmailSettings } from '@/lib/office/settings'
import { volunteerToken } from '@/lib/volunteer-link'
import { audienceQuery, resolveAudience, type AudienceSpec, type Candidate, type Contact, type ResolvedAudience } from './audience'
import { EMAIL_MAX_ATTEMPTS, nextEmailAttempt } from './backoff'
import { brandFromTheme } from './brand'
import { emailLimits, senderIdentity, type SenderIdentity } from './env'
import { campaignHeaders, oneClickUnsubscribeUrl, unsubscribeUrl } from './headers'
import { usesTag, type MergeContext } from './merge'
import { footerLines, renderCampaign, type MailBrand } from './render'
import { sendCampaignMessage } from './send'
import { suppressedHashes } from './suppressions'
import type { EmailAdapter, EmailMessage } from './types'
import { emailHash, unsubToken } from './unsub-token'

/**
 * The campaign engine (wave D spec 9.3). No caller checks live here: `lib/email-office-queries.ts` checks the admin, the cron route
 * checks the secret, and both only reach this file when email is switched on. Rows are moved with plain SQL where atomicity matters
 * (the claim, the start, the counts) because the Local API cannot express `FOR UPDATE SKIP LOCKED`.
 */
type Row = Record<string, unknown>
const rows = async (payload: Payload, q: ReturnType<typeof sql>): Promise<Row[]> => ((await payload.db.drizzle.execute(q)) as unknown as { rows: Row[] }).rows

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

// ---- context ---------------------------------------------------------------------------------------------------------------

export type MailContext = { identity: SenderIdentity; clubName: string; contact: string; brand: MailBrand; settings: EmailSettings; serverURL: string }

/** Sender, look and wording, all from config: env, the club global, the theme and the office settings. Null when no sender address is configured. */
export async function loadMailContext(payload: Payload): Promise<MailContext | null> {
  const [club, theme, doc] = await Promise.all([getClub(), getTheme(), payload.findGlobal({ slug: 'office-settings', depth: 0, overrideAccess: true }).catch(() => null)])
  const identity = senderIdentity({ name: club.name, email: club.email })
  if (!identity) return null
  return { identity, clubName: club.name, contact: club.email, brand: brandFromTheme(theme), settings: resolveOfficeSettings(doc).email, serverURL: payload.config.serverURL.replace(/\/+$/, '') }
}

const footerFor = (ctx: MailContext): string[] => footerLines({ template: ctx.settings.footer, unsubscribeText: ctx.settings.unsubscribeText, complianceText: ctx.settings.complianceText, clubName: ctx.clubName, contact: ctx.contact })

export type SampleCampaign = { subject: string; body: string }

/** What a message looks like, with a sample first name and placeholder links (the page preview and the test copy use real values where they exist). */
export function previewMessage(ctx: MailContext, c: SampleCampaign, over: Partial<MergeContext> & { unsubscribe?: string } = {}) {
  const merge: MergeContext = { firstName: over.firstName ?? 'Sam', clubName: ctx.clubName, volunteerLink: over.volunteerLink ?? `${ctx.serverURL}/volunteer/example` }
  return renderCampaign({ subject: c.subject, body: c.body, ctx: merge, brand: ctx.brand, footer: footerFor(ctx), unsubscribeUrl: over.unsubscribe ?? `${ctx.serverURL}/unsubscribe/example` })
}

// ---- audience --------------------------------------------------------------------------------------------------------------

type MemberDoc = {
  id: number
  firstName?: string | null
  preferredName?: string | null
  email?: string | null
  doNotEmail?: boolean | null
  erasedAt?: string | null
  dateOfBirth?: string | null
  guardians?: unknown[] | null
  player?: { firstName?: string | null; isJunior?: boolean | null } | number | null
}

const contactOf = (m: MemberDoc): Contact => ({
  id: m.id,
  email: clean(m.email) || null,
  firstName: clean(m.preferredName) || clean(m.firstName) || (m.player && typeof m.player === 'object' ? clean(m.player.firstName) : '') || null,
  doNotEmail: m.doNotEmail === true,
  erased: Boolean(m.erasedAt),
})

export type AudienceOptions = { cap?: number; /** Required for the owes-fees segment: the member ids that owe, from the fees module. */ owingIds?: ReadonlySet<number> | null }

/** Members matching the spec, resolved to distinct addresses with the suppression list applied. */
export async function loadAudience(payload: Payload, spec: AudienceSpec, opts: AudienceOptions = {}): Promise<ResolvedAudience> {
  const today = currentClubDate()
  const and = [memberWhere(audienceQuery(spec), today)]
  if (spec.segment === 'volunteers') and.push({ roles: { equals: 'volunteer' } })
  if (spec.segment === 'owes-fees') {
    const ids = [...(opts.owingIds ?? [])]
    if (ids.length === 0) return resolveAudience([], () => false, opts.cap ?? Infinity)
    and.push({ id: { in: ids } })
  }
  const found = await payload.find({ collection: 'members', where: { and }, pagination: false, depth: 1, overrideAccess: true })
  const docs = found.docs as unknown as MemberDoc[]
  const candidates: Candidate[] = docs.map((m) => ({
    ...contactOf(m),
    junior: !m.erasedAt && memberIsJunior({ dateOfBirth: m.dateOfBirth, player: m.player && typeof m.player === 'object' ? m.player : null }, today),
    guardians: (m.guardians ?? []).filter((g): g is MemberDoc => Boolean(g) && typeof g === 'object').map(contactOf),
  }))
  const addresses = new Set<string>()
  for (const c of candidates) {
    if (c.email) addresses.add(c.email.toLowerCase())
    for (const g of c.guardians) if (g.email) addresses.add(g.email.toLowerCase())
  }
  const hashOf = new Map([...addresses].map((a) => [a, emailHash(a)]))
  const blocked = await suppressedHashes(payload, [...hashOf.values()])
  return resolveAudience(candidates, (address) => blocked.has(hashOf.get(address) ?? emailHash(address)), opts.cap ?? emailLimits().maxRecipients)
}

// ---- start -----------------------------------------------------------------------------------------------------------------

/**
 * Freezes the audience into recipient rows and flips the campaign to `sending`, in one transaction. The flip is `WHERE status = 'draft'`,
 * so a second press (or a second device) changes nothing and gets `false`. The same address never gets two rows.
 */
export async function startCampaign(payload: Payload, campaignId: number, recipients: ResolvedAudience['recipients']): Promise<boolean> {
  return payload.db.drizzle.transaction(async (tx) => {
    const flipped = (await tx.execute(sql`UPDATE "payload"."email_campaigns" SET "status" = 'sending', "counts_queued" = ${recipients.length}, "counts_sent" = 0, "counts_failed" = 0, "counts_skipped" = 0, "updated_at" = now() WHERE "id" = ${campaignId} AND "status" = 'draft' RETURNING id`)) as unknown as { rows: Row[] }
    if (flipped.rows.length !== 1) return false
    for (let i = 0; i < recipients.length; i += 200) {
      const tuples = recipients.slice(i, i + 200).map((r) => sql`(${campaignId}, ${r.memberId}, ${r.email}, ${emailHash(r.email)}, ${r.firstName}, 'queued', 0, now(), now())`)
      await tx.execute(sql`INSERT INTO "payload"."email_recipients" ("campaign_id", "member_id", "email", "email_hash", "first_name", "status", "attempts", "created_at", "updated_at") VALUES ${sql.join(tuples, sql`, `)} ON CONFLICT ("campaign_id", "email") DO NOTHING`)
    }
    return true
  })
}

/** Stops a campaign that is sending. Rows already sent stay sent; rows not yet sent are never sent. */
export async function cancelCampaignRows(payload: Payload, campaignId: number): Promise<boolean> {
  const out = await rows(payload, sql`UPDATE "payload"."email_campaigns" SET "status" = 'cancelled', "sent_at" = now(), "updated_at" = now() WHERE "id" = ${campaignId} AND "status" = 'sending' RETURNING id`)
  return out.length === 1
}

// ---- batches ---------------------------------------------------------------------------------------------------------------

export type Claimed = { id: number; memberId: number | null; email: string | null; firstName: string | null; attempts: number; hash: string }
const LEASE_MINUTES = 10

/** Claims up to `size` ready rows for this worker. `FOR UPDATE SKIP LOCKED` means two workers can never hold the same row. */
export async function claimBatch(payload: Payload, campaignId: number, size: number, token: string): Promise<Claimed[]> {
  const out = await rows(
    payload,
    sql`UPDATE "payload"."email_recipients" r SET "status" = 'sending', "claim_token" = ${token}, "claimed_at" = now(), "attempts" = r."attempts" + 1, "updated_at" = now()
        WHERE r."id" IN (
          SELECT x."id" FROM "payload"."email_recipients" x
          WHERE x."campaign_id" = ${campaignId}
            AND EXISTS (SELECT 1 FROM "payload"."email_campaigns" c WHERE c."id" = x."campaign_id" AND c."status" = 'sending')
            AND ((x."status" = 'queued' AND (x."next_attempt_at" IS NULL OR x."next_attempt_at" <= now()))
              OR (x."status" = 'sending' AND x."claimed_at" < now() - (${LEASE_MINUTES} * interval '1 minute')))
          ORDER BY x."id" LIMIT ${size} FOR UPDATE SKIP LOCKED)
        RETURNING r."id", r."member_id", r."email", r."email_hash", r."first_name", r."attempts"`,
  )
  return out.map((r) => ({ id: Number(r.id), memberId: r.member_id == null ? null : Number(r.member_id), email: (r.email as string | null) ?? null, firstName: (r.first_name as string | null) ?? null, attempts: Number(r.attempts), hash: String(r.email_hash) }))
}

type Finish = { status: 'sent' | 'failed' | 'skipped-suppressed' | 'skipped-no-email'; providerId?: string | null; error?: string | null } | { status: 'retry'; at: Date; error: string }

/** Writes a recipient's result, but only while this worker still holds the claim (a stale worker cannot overwrite a newer one). */
async function finish(payload: Payload, rec: Claimed, token: string, f: Finish): Promise<void> {
  if (f.status === 'retry') {
    await rows(payload, sql`UPDATE "payload"."email_recipients" SET "status" = 'queued', "next_attempt_at" = ${f.at.toISOString()}, "error" = ${f.error.slice(0, 200)}, "claim_token" = NULL, "updated_at" = now() WHERE "id" = ${rec.id} AND "claim_token" = ${token} RETURNING id`)
    return
  }
  await rows(
    payload,
    sql`UPDATE "payload"."email_recipients" SET "status" = ${f.status}::"payload"."enum_email_recipients_status", "provider_id" = ${f.providerId ?? null}, "error" = ${f.error ? f.error.slice(0, 200) : null}, "claim_token" = NULL, "next_attempt_at" = NULL, "updated_at" = now() WHERE "id" = ${rec.id} AND "claim_token" = ${token} RETURNING id`,
  )
}

/** Puts a row back for a later try without using one of its attempts (a provider outage that is nobody's fault). */
async function release(payload: Payload, rec: Claimed, token: string, at: Date, error: string): Promise<void> {
  await rows(payload, sql`UPDATE "payload"."email_recipients" SET "status" = 'queued', "attempts" = GREATEST("attempts" - 1, 0), "next_attempt_at" = ${at.toISOString()}, "error" = ${error.slice(0, 200)}, "claim_token" = NULL, "updated_at" = now() WHERE "id" = ${rec.id} AND "claim_token" = ${token} RETURNING id`)
}

/** Refreshes the counts, and marks the campaign `sent` once nothing is left to try. */
export async function recount(payload: Payload, campaignId: number): Promise<{ queued: number; sent: number; failed: number; skipped: number; status: string }> {
  const out = await rows(
    payload,
    sql`WITH c AS (
          SELECT count(*) FILTER (WHERE status IN ('queued','sending'))::int AS queued, count(*) FILTER (WHERE status = 'sent')::int AS sent,
                 count(*) FILTER (WHERE status = 'failed')::int AS failed, count(*) FILTER (WHERE status IN ('skipped-suppressed','skipped-no-email'))::int AS skipped
          FROM "payload"."email_recipients" WHERE campaign_id = ${campaignId})
        UPDATE "payload"."email_campaigns" k SET "counts_queued" = c.queued, "counts_sent" = c.sent, "counts_failed" = c.failed, "counts_skipped" = c.skipped,
          "status" = CASE WHEN k."status" = 'sending' AND c.queued = 0 THEN 'sent'::"payload"."enum_email_campaigns_status" ELSE k."status" END,
          "sent_at" = CASE WHEN k."status" = 'sending' AND c.queued = 0 THEN now() ELSE k."sent_at" END, "updated_at" = now()
        FROM c WHERE k."id" = ${campaignId}
        RETURNING c.queued, c.sent, c.failed, c.skipped, k."status" AS status`,
  )
  const r = out[0] ?? { queued: 0, sent: 0, failed: 0, skipped: 0, status: 'draft' }
  return { queued: Number(r.queued), sent: Number(r.sent), failed: Number(r.failed), skipped: Number(r.skipped), status: String(r.status) }
}

export type BatchDeps = { adapter: EmailAdapter; ctx: MailContext; sleep?: (ms: number) => Promise<void>; size?: number; ratePerSecond?: number }
export type BatchResult = { processed: number; sent: number; skipped: number; failed: number; retrying: number; remaining: number; status: string; stopped: boolean }

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Builds the message for one recipient from the campaign and the member, with the personal unsubscribe link and the optional personal volunteer link. */
async function messageFor(payload: Payload, ctx: MailContext, campaign: SampleCampaign, rec: Claimed & { email: string }): Promise<EmailMessage> {
  let volunteerLink: string | null = null
  if (rec.memberId && usesTag(campaign.body, 'volunteerLink')) {
    const m = (await payload.findByID({ collection: 'members', id: rec.memberId, depth: 0, select: { volunteerLinkVersion: true }, overrideAccess: true }).catch(() => null)) as { volunteerLinkVersion?: number | null } | null
    if (m) volunteerLink = `${ctx.serverURL}/volunteer/${volunteerToken(rec.memberId, m.volunteerLinkVersion ?? 0)}`
  }
  const tok = unsubToken(rec.id)
  const link = unsubscribeUrl(ctx.serverURL, tok)
  const mail = renderCampaign({ subject: campaign.subject, body: campaign.body, ctx: { firstName: rec.firstName, clubName: ctx.clubName, volunteerLink }, brand: ctx.brand, footer: footerFor(ctx), unsubscribeUrl: link })
  return {
    to: rec.email,
    from: { name: ctx.identity.name, address: ctx.identity.address },
    ...(ctx.identity.replyTo ? { replyTo: ctx.identity.replyTo } : {}),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: campaignHeaders(oneClickUnsubscribeUrl(ctx.serverURL, tok)),
    idempotencyKey: `campaign-${rec.id}`,
  }
}

async function isSending(payload: Payload, campaignId: number): Promise<boolean> {
  return (await rows(payload, sql`SELECT 1 FROM "payload"."email_campaigns" WHERE "id" = ${campaignId} AND "status" = 'sending'`)).length === 1
}

/** One batch: claim, then for each row re-check who may be mailed, send, record. Stops early if the provider rejects the key. */
export async function runBatch(payload: Payload, campaignId: number, deps: BatchDeps): Promise<BatchResult> {
  const limits = emailLimits()
  const sleep = deps.sleep ?? realSleep
  const gap = Math.ceil(1000 / (deps.ratePerSecond ?? limits.ratePerSecond))
  const camp = (await payload.findByID({ collection: 'email-campaigns', id: campaignId, depth: 0, overrideAccess: true }).catch(() => null)) as { subject: string; body: string; status: string } | null
  const result: BatchResult = { processed: 0, sent: 0, skipped: 0, failed: 0, retrying: 0, remaining: 0, status: camp?.status ?? 'missing', stopped: false }
  if (!camp || camp.status !== 'sending') return result
  const token = randomUUID()
  const claimed = await claimBatch(payload, campaignId, deps.size ?? limits.batchSize, token)
  let first = true
  for (const rec of claimed) {
    if (!first) await sleep(gap)
    first = false
    // Stop sending has to end the batch in flight too: look again before every send and hand back what is left.
    if (!(await isSending(payload, campaignId))) {
      for (const rest of claimed.slice(claimed.indexOf(rec))) await release(payload, rest, token, new Date(), 'Sending was stopped.')
      result.stopped = true
      break
    }
    result.processed += 1
    if (!rec.email) {
      await finish(payload, rec, token, { status: 'skipped-no-email' })
      result.skipped += 1
      continue
    }
    const address: string = rec.email
    // Re-read who may be mailed right now: an unsubscribe, a do-not-email tick or an erasure since the audience was frozen is honoured.
    const blocked = (await suppressedHashes(payload, [rec.hash])).size > 0
    const member = rec.memberId ? ((await payload.findByID({ collection: 'members', id: rec.memberId, depth: 0, select: { doNotEmail: true, erasedAt: true }, overrideAccess: true }).catch(() => null)) as { doNotEmail?: boolean | null; erasedAt?: string | null } | null) : null
    if (blocked || member?.doNotEmail === true || member?.erasedAt) {
      await finish(payload, rec, token, { status: 'skipped-suppressed' })
      result.skipped += 1
      continue
    }
    const outcome = await sendCampaignMessage(payload, deps.adapter, await messageFor(payload, deps.ctx, camp, { ...rec, email: address }), { mode: 'campaign' })
    if (outcome.status === 'sent') {
      await finish(payload, rec, token, { status: 'sent', providerId: outcome.providerId })
      result.sent += 1
    } else if (outcome.status === 'suppressed') {
      await finish(payload, rec, token, { status: 'skipped-suppressed' })
      result.skipped += 1
    } else if (outcome.kind === 'auth') {
      await release(payload, rec, token, new Date(Date.now() + 15 * 60_000), 'The mail provider refused our key.')
      result.stopped = true
      result.retrying += 1
      for (const rest of claimed.slice(claimed.indexOf(rec) + 1)) await release(payload, rest, token, new Date(Date.now() + 15 * 60_000), 'The mail provider refused our key.')
      break
    } else if (outcome.kind === 'permanent') {
      await finish(payload, rec, token, { status: 'failed', error: outcome.message })
      result.failed += 1
    } else {
      const at = nextEmailAttempt(new Date(), rec.attempts, outcome.kind)
      if (at) {
        await finish(payload, rec, token, { status: 'retry', at, error: outcome.message })
        result.retrying += 1
      } else {
        await finish(payload, rec, token, { status: 'failed', error: `${outcome.message} (gave up after ${EMAIL_MAX_ATTEMPTS} tries)` })
        result.failed += 1
      }
    }
  }
  const counts = await recount(payload, campaignId)
  result.remaining = counts.queued
  result.status = counts.status
  return result
}

/** Campaigns that are still sending, oldest first (the schedule picks these up when nobody has the page open). */
export async function sendingCampaignIds(payload: Payload): Promise<number[]> {
  const found = await payload.find({ collection: 'email-campaigns', where: { status: { equals: 'sending' } }, sort: 'createdAt', pagination: false, depth: 0, overrideAccess: true })
  return found.docs.map((d) => d.id as number)
}

// ---- retention -------------------------------------------------------------------------------------------------------------

/**
 * Blanks the personal text on every recipient of a finished campaign once the retention period has passed (address, first name,
 * provider id, error text). The address hash, the status and the campaign counts stay; so does the unsubscribe list.
 */
export async function purgeExpiredRecipients(payload: Payload, retentionDays: number): Promise<{ campaigns: number }> {
  const due = await rows(payload, sql`SELECT id FROM "payload"."email_campaigns" WHERE "status" IN ('sent','cancelled') AND "recipients_purged_at" IS NULL AND "sent_at" < now() - (${retentionDays} * interval '1 day')`)
  const ids = due.map((r) => Number(r.id))
  if (ids.length === 0) return { campaigns: 0 }
  await rows(payload, sql`UPDATE "payload"."email_recipients" SET "email" = NULL, "first_name" = NULL, "provider_id" = NULL, "error" = NULL, "updated_at" = now() WHERE "campaign_id" IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) RETURNING id`)
  await rows(payload, sql`UPDATE "payload"."email_campaigns" SET "recipients_purged_at" = now(), "updated_at" = now() WHERE "id" IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) RETURNING id`)
  return { campaigns: ids.length }
}
