import 'server-only'
import type { TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { isAdminUser } from '@/payload/access'
import { feeOwingMemberIds } from './fees-office-queries'
import { audienceJson, parseAudience, previewSentence, type AudienceSpec, type AudienceCounts } from './email/audience'
import { cancelCampaignRows, loadAudience, loadMailContext, previewMessage, recount, runBatch, startCampaign, type BatchResult } from './email/campaign'
import { emailEnabled, emailLimits } from './email/env'
import type { EmailErrorCode, EmailNoticeCode } from './email/flash'
import { templateProblem } from './email/merge'
import { sendCampaignMessage } from './email/send'
import { getEmailAdapter } from './email/select'
import { addSuppressionForAddress } from './email/suppressions'
import { campaignHeaders } from './email/headers'
import { isValidEmail, normaliseEmail } from './office/member-input'
import { sanitiseSummary } from './office/audit'
import { writeAudit } from './office/audit-write'
import { MEMBER_ROLES } from './office/members'

/**
 * The data layer for the Email module (wave D spec 9). Admin only, and only while mail is switched on: every function checks both
 * first and answers null or `forbidden` otherwise, so the module is invisible when it is off. Sending itself lives in `lib/email/`.
 */
const adminOn = (user: unknown): user is TypedUser => isAdminUser(user as never) && emailEnabled()

export type ActionResult<T extends object = object> = ({ ok: true; notice: EmailNoticeCode } & T) | { ok: false; code: EmailErrorCode }
const fail = (code: EmailErrorCode): { ok: false; code: EmailErrorCode } => ({ ok: false, code })

const idOf = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d{1,9}$/.test(v) ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}
export const parseCampaignId = idOf

type CampaignDoc = { id: number; subject: string; body: string; audience?: unknown; status: 'draft' | 'sending' | 'sent' | 'cancelled'; counts?: { queued?: number | null; sent?: number | null; failed?: number | null; skipped?: number | null } | null; sentAt?: string | null; createdAt: string; recipientsPurgedAt?: string | null }

const countsOf = (c: CampaignDoc) => ({ queued: c.counts?.queued ?? 0, sent: c.counts?.sent ?? 0, failed: c.counts?.failed ?? 0, skipped: c.counts?.skipped ?? 0 })

export type CampaignRow = { id: number; subject: string; status: CampaignDoc['status']; queued: number; sent: number; failed: number; skipped: number; createdAt: string; sentAt: string | null }
export type SuppressionRow = { id: number; email: string | null; reason: string; at: string }
export type EmailOverview = { campaigns: CampaignRow[]; suppressions: SuppressionRow[]; suppressionTotal: number; fromAddress: string; providerLive: boolean; adapterId: string }

export async function getEmailOverview(user: unknown): Promise<EmailOverview | null> {
  if (!adminOn(user)) return null
  const payload = await getPayloadClient()
  const adapter = getEmailAdapter()
  const ctx = await loadMailContext(payload)
  if (!adapter || !ctx) return null
  const [campaigns, sup] = await Promise.all([
    payload.find({ collection: 'email-campaigns', sort: '-createdAt', limit: 30, depth: 0, user, overrideAccess: false }),
    payload.find({ collection: 'email-suppressions', sort: '-at', limit: 100, depth: 0, user, overrideAccess: false }),
  ])
  return {
    campaigns: (campaigns.docs as unknown as CampaignDoc[]).map((c) => ({ id: c.id, subject: c.subject, status: c.status, ...countsOf(c), createdAt: c.createdAt, sentAt: c.sentAt ?? null })),
    suppressions: (sup.docs as unknown as { id: number; email?: string | null; reason: string; at: string }[]).map((s) => ({ id: s.id, email: s.email ?? null, reason: s.reason, at: s.at })),
    suppressionTotal: sup.totalDocs,
    fromAddress: `${ctx.identity.name} <${ctx.identity.address}>`,
    providerLive: adapter.live,
    adapterId: adapter.id,
  }
}

export type CampaignPage = {
  id: number
  subject: string
  body: string
  status: CampaignDoc['status']
  audience: AudienceSpec
  counts: ReturnType<typeof countsOf>
  audienceCounts: AudienceCounts | null
  sentence: string | null
  overCap: boolean
  maxRecipients: number
  preview: { subject: string; html: string; text: string }
  purged: boolean
  adapterLive: boolean
}

async function owing(user: TypedUser, spec: AudienceSpec): Promise<ReadonlySet<number> | null> {
  return spec.segment === 'owes-fees' ? feeOwingMemberIds(user) : null
}

export async function getCampaignPage(user: unknown, idRaw: unknown): Promise<CampaignPage | null> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return null
  const payload = await getPayloadClient()
  const doc = (await payload.findByID({ collection: 'email-campaigns', id, depth: 0, user, overrideAccess: false }).catch(() => null)) as unknown as CampaignDoc | null
  const ctx = await loadMailContext(payload)
  const adapter = getEmailAdapter()
  if (!doc || !ctx || !adapter) return null
  const audience = parseAudience(doc.audience)
  const draft = doc.status === 'draft'
  const resolved = draft ? await loadAudience(payload, audience, { owingIds: await owing(user, audience) }) : null
  const limits = emailLimits()
  let preview = { subject: doc.subject, html: '', text: '' }
  try {
    preview = previewMessage(ctx, { subject: doc.subject, body: doc.body })
  } catch {
    /* an unknown tag in a draft: the page shows the form without a preview */
  }
  return {
    id,
    subject: doc.subject,
    body: doc.body,
    status: doc.status,
    audience,
    counts: countsOf(doc),
    audienceCounts: resolved?.counts ?? null,
    sentence: resolved ? previewSentence(resolved.counts) : null,
    overCap: resolved?.overCap ?? false,
    maxRecipients: limits.maxRecipients,
    preview,
    purged: Boolean(doc.recipientsPurgedAt),
    adapterLive: adapter.live,
  }
}

export type CampaignInput = { subject: unknown; body: unknown; status?: unknown; role?: unknown; juniors?: unknown; segment?: unknown }

function clean(input: CampaignInput): { subject: string; body: string; audience: AudienceSpec } | EmailErrorCode {
  const subject = typeof input.subject === 'string' ? input.subject.replace(/\s+/g, ' ').trim().slice(0, 150) : ''
  const body = typeof input.body === 'string' ? input.body.replace(/\r\n?/g, '\n').trim().slice(0, 20000) : ''
  if (!subject) return 'subject'
  if (!body) return 'body'
  if (templateProblem(subject) || templateProblem(body)) return 'tag'
  return { subject, body, audience: parseAudience({ status: input.status, role: input.role, juniors: input.juniors, segment: input.segment }) }
}

export async function createCampaign(user: unknown, input: CampaignInput): Promise<ActionResult<{ id: number }>> {
  if (!adminOn(user)) return fail('forbidden')
  const c = clean(input)
  if (typeof c === 'string') return fail(c)
  const payload = await getPayloadClient()
  try {
    const doc = await payload.create({ collection: 'email-campaigns', data: { subject: c.subject, body: c.body, audience: audienceJson(c.audience) } as never, user, overrideAccess: false, depth: 0 })
    return { ok: true, notice: 'created', id: doc.id as number }
  } catch {
    return fail('save')
  }
}

export async function saveCampaign(user: unknown, idRaw: unknown, input: CampaignInput): Promise<ActionResult> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return fail(id === null ? 'not-found' : 'forbidden')
  const c = clean(input)
  if (typeof c === 'string') return fail(c)
  const payload = await getPayloadClient()
  const current = (await payload.findByID({ collection: 'email-campaigns', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as CampaignDoc | null
  if (!current) return fail('not-found')
  if (current.status !== 'draft') return fail('not-draft')
  try {
    await payload.update({ collection: 'email-campaigns', id, data: { subject: c.subject, body: c.body, audience: audienceJson(c.audience) }, user, overrideAccess: false, depth: 0 })
    return { ok: true, notice: 'saved' }
  } catch {
    return fail('save')
  }
}

/** "Send me a copy first": one message to the signed-in admin's own login address, marked [TEST], with no recipient row and no counts. */
export async function sendTestCopy(user: unknown, idRaw: unknown): Promise<ActionResult> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return fail(id === null ? 'not-found' : 'forbidden')
  const payload = await getPayloadClient()
  const doc = (await payload.findByID({ collection: 'email-campaigns', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as CampaignDoc | null
  const ctx = await loadMailContext(payload)
  const adapter = getEmailAdapter()
  const to = normaliseEmail((user as { email?: string }).email)
  if (!doc || !ctx || !adapter) return fail('not-found')
  if (!to || !isValidEmail(to)) return fail('address')
  const first = ((user as { name?: string | null }).name ?? '').trim().split(/\s+/)[0] || null
  const unsubscribe = `${ctx.serverURL}/unsubscribe/test`
  let mail
  try {
    mail = previewMessage(ctx, { subject: doc.subject, body: doc.body }, { firstName: first, unsubscribe })
  } catch {
    return fail('tag')
  }
  const out = await sendCampaignMessage(payload, adapter, {
    to,
    from: { name: ctx.identity.name, address: ctx.identity.address },
    ...(ctx.identity.replyTo ? { replyTo: ctx.identity.replyTo } : {}),
    subject: `[TEST] ${mail.subject}`,
    html: mail.html,
    text: mail.text,
    headers: campaignHeaders(unsubscribe),
  }, { mode: 'test' })
  return out.status === 'sent' ? { ok: true, notice: 'test-sent' } : fail('save')
}

/** Confirm and send. `expected` is the "will receive" number the admin saw; if the list has moved, nothing is sent and they look again. */
export async function startSend(user: unknown, idRaw: unknown, expected: unknown): Promise<ActionResult> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return fail(id === null ? 'not-found' : 'forbidden')
  const payload = await getPayloadClient()
  const doc = (await payload.findByID({ collection: 'email-campaigns', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as CampaignDoc | null
  if (!doc) return fail('not-found')
  if (doc.status !== 'draft') return fail('not-draft')
  const clean2 = clean({ subject: doc.subject, body: doc.body })
  if (typeof clean2 === 'string') return fail(clean2)
  const audience = parseAudience(doc.audience)
  const resolved = await loadAudience(payload, audience, { owingIds: await owing(user, audience) })
  if (resolved.overCap) return fail('over-cap')
  if (resolved.recipients.length === 0) return fail('empty')
  if (String(resolved.recipients.length) !== String(expected)) return fail('changed')
  if (!(await startCampaign(payload, id, resolved.recipients))) return fail('sending')
  await writeAudit(payload, {
    userId: user.id as number,
    action: 'email-send',
    module: 'email',
    summary: sanitiseSummary({ status: audience.status ?? 'any', role: audience.role ?? 'any', juniors: audience.juniors, segment: audience.segment ?? 'none', willReceive: resolved.recipients.length }, { status: ['active', 'past', 'any'], role: [...MEMBER_ROLES, 'any'], juniors: 'boolean', segment: ['owes-fees', 'volunteers', 'none'], willReceive: 'number' }),
    rowCount: resolved.recipients.length,
    includedSensitive: false,
  })
  return { ok: true, notice: 'started' }
}

export async function stopSend(user: unknown, idRaw: unknown): Promise<ActionResult> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return fail(id === null ? 'not-found' : 'forbidden')
  const payload = await getPayloadClient()
  if (!(await cancelCampaignRows(payload, id))) return fail('sending')
  await recount(payload, id)
  return { ok: true, notice: 'stopped' }
}

/** One batch for the admin (the progress loop and the no-script "Continue sending" button call this). */
export async function runBatchForAdmin(user: unknown, idRaw: unknown): Promise<BatchResult | null> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return null
  return runBatchFor(id)
}

/** One batch without a signed-in admin (the schedule): the caller has proven the cron secret and that mail is on. */
export async function runBatchFor(id: number, deps: { sleep?: (ms: number) => Promise<void> } = {}): Promise<BatchResult | null> {
  const payload = await getPayloadClient()
  const adapter = getEmailAdapter()
  const ctx = await loadMailContext(payload)
  if (!adapter || !ctx) return null
  return runBatch(payload, id, { adapter, ctx, ...deps })
}

export async function addManualSuppression(user: unknown, raw: unknown): Promise<ActionResult> {
  if (!adminOn(user)) return fail('forbidden')
  const email = normaliseEmail(raw)
  if (!email || !isValidEmail(email)) return fail('address')
  const payload = await getPayloadClient()
  await addSuppressionForAddress(payload, email, 'manual', 'admin')
  await writeAudit(payload, { userId: user.id as number, action: 'bulk-change', module: 'email', summary: sanitiseSummary({ change: 'suppression-added' }, { change: ['suppression-added', 'suppression-removed'] }), rowCount: 1, includedSensitive: false })
  return { ok: true, notice: 'suppression-added' }
}

export async function removeSuppression(user: unknown, idRaw: unknown): Promise<ActionResult> {
  const id = idOf(idRaw)
  if (!adminOn(user) || id === null) return fail(id === null ? 'not-found' : 'forbidden')
  const payload = await getPayloadClient()
  const row = (await payload.findByID({ collection: 'email-suppressions', id, depth: 0, overrideAccess: true }).catch(() => null)) as unknown as { emailHash: string } | null
  if (!row) return fail('not-found')
  await payload.delete({ collection: 'email-suppressions', id, overrideAccess: true })
  await writeAudit(payload, { userId: user.id as number, action: 'bulk-change', module: 'email', summary: sanitiseSummary({ change: 'suppression-removed' }, { change: ['suppression-added', 'suppression-removed'] }), rowCount: 1, includedSensitive: false })
  return { ok: true, notice: 'suppression-removed' }
}

