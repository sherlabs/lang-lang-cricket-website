import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { randomUUID } from 'node:crypto'
import type { Payload } from 'payload'
import { SOCIAL_ADAPTER_TIMEOUT_MS, SOCIAL_CLAIM_BATCH, SOCIAL_LEASE_MINUTES, SOCIAL_RUN_BUDGET_MS } from '@/config/site'
import { getClub } from '@/lib/club'
import { isStaffUser } from '@/payload/access'
import { getAdapter } from './adapters'
import { scrubSecrets, storedReason } from './adapters/scrub'
import type { Network, NetworkAdapter, PublishResult } from './adapters/types'
import { mintImageUrl } from './image-url'
import { nextAttemptAt } from './backoff'
import type { PostSpec } from './post-spec'
import { REASONS } from './reasons'
import { loadSocialPlayers, clubToday } from './sources/shared'
import { renderBytesFromSpec } from './spec-render'
import { derivePostStatus, type TargetFacts, type TargetStatus } from './status'
import type { SizeKey } from './types'
import type { SocialEnv } from '@/lib/social/adapters/types'

/**
 * The publisher (wave C spec 4.6). EVERY write here is explicit SQL against "payload"."social_posts" and "payload"."social_post_targets":
 * the Local API cannot express a claim-token predicate, and updating a Payload array rewrites every row, so per-target moves and the
 * token-guarded finish need SQL. Double posting is the biggest risk, so the protections are layered: an atomic claim
 * (`FOR UPDATE SKIP LOCKED`), a per-target at-most-once step, the `unknown` state instead of blind retry, and a finish that only
 * changes a row still holding our token.
 */
type Row = Record<string, unknown>
const rows = async (payload: Payload, q: ReturnType<typeof sql>): Promise<Row[]> => ((await payload.db.drizzle.execute(q)) as unknown as { rows: Row[] }).rows

export type PublishOptions = {
  /** "Post now": claim exactly this post, if it is `scheduled`, whatever its time. */
  onlyId?: number
  env?: SocialEnv
  /** Tests inject adapters (including fakes standing in for the real networks). */
  adapters?: Partial<Record<Network, NetworkAdapter>>
  now?: Date
  timeoutMs?: number
  /** Render the picture once before sending (default true). */
  verifyImage?: boolean
  budgetMs?: number
}
export type PublishSummary = { claimed: { id: number; status: string }[] }

export async function claimDue(payload: Payload, token: string, o: { onlyId?: number; batch?: number; lease?: number } = {}): Promise<number[]> {
  const batch = o.batch ?? SOCIAL_CLAIM_BATCH
  const lease = o.lease ?? SOCIAL_LEASE_MINUTES
  const claimed =
    o.onlyId !== undefined
      ? await rows(payload, sql`
          UPDATE "payload"."social_posts" SET status = 'publishing', claim_token = ${token}, claimed_at = now()
          WHERE id IN (SELECT id FROM "payload"."social_posts" WHERE id = ${o.onlyId} AND status = 'scheduled' FOR UPDATE SKIP LOCKED)
          RETURNING id`)
      : await rows(payload, sql`
          UPDATE "payload"."social_posts" SET status = 'publishing', claim_token = ${token}, claimed_at = now()
          WHERE id IN (
            SELECT id FROM "payload"."social_posts"
            WHERE (status = 'scheduled' AND next_run_at <= now())
               OR (status = 'publishing' AND claimed_at < now() - make_interval(mins => ${lease}::int))
            ORDER BY COALESCE(next_run_at, claimed_at) LIMIT ${batch}::int FOR UPDATE SKIP LOCKED)
          RETURNING id`)
  return claimed.map((r) => Number(r.id))
}

/** The final write. Only a worker still holding the claim changes a row; a stale one changes none. Returns whether it applied. */
export async function finishPost(payload: Payload, id: number, token: string, o: { status: 'published' | 'failed' | 'scheduled'; nextRunAt: Date | null }): Promise<boolean> {
  const done = o.status === 'scheduled'
  const res = await rows(payload, sql`
    UPDATE "payload"."social_posts"
    SET status = ${o.status}, next_run_at = ${o.nextRunAt ? o.nextRunAt.toISOString() : null}::timestamptz,
        finished_at = CASE WHEN ${done} THEN finished_at ELSE now() END, claim_token = NULL, claimed_at = NULL
    WHERE id = ${id} AND claim_token = ${token}
    RETURNING id`)
  return res.length === 1
}

type TargetRow = { id: number; network: Network; size: SizeKey; finalText: string; attempts: number }

const toFacts = (r: Row): TargetFacts => ({ status: String(r.status) as TargetStatus, attempts: Number(r.attempts), nextAttemptAt: r.next_attempt_at ? new Date(String(r.next_attempt_at)) : null })

export async function targetFacts(payload: Payload, postId: number): Promise<TargetFacts[]> {
  return (await rows(payload, sql`SELECT status, attempts, next_attempt_at FROM "payload"."social_post_targets" WHERE post_id = ${postId} ORDER BY id`)).map(toFacts)
}

async function failTarget(payload: Payload, targetId: number, code: string, reason?: string, env: SocialEnv = process.env, from: 'pending' | 'publishing' = 'pending') {
  await rows(payload, sql`
    UPDATE "payload"."social_post_targets" SET status = 'failed', error_code = ${code}, last_error = ${storedReason(reason ?? REASONS[code] ?? 'It did not post.', env)}
    WHERE id = ${targetId} AND status = ${from} RETURNING id`)
}

/** Approval and content checks before anything is sent (spec 4.6 step 3). Null when everything still holds, else the failure code. */
export async function revalidate(payload: Payload, approvedById: number | null, spec: PostSpec): Promise<'approver_inactive' | 'content_changed' | null> {
  if (approvedById === null) return 'approver_inactive'
  const approver = await payload.findByID({ collection: 'users', id: approvedById, depth: 0, overrideAccess: true }).catch(() => null)
  if (!isStaffUser(approver)) return 'approver_inactive'
  if (spec.snapshot.players.length > 0) {
    const players = await loadSocialPlayers(clubToday())
    for (const p of spec.snapshot.players) {
      const now = players.get(p.id)
      // Gone, hidden, renamed or no longer allowed on social networks (a junior lost the opt-in): the approved picture is stale.
      if (!now || now.name !== p.name || !now.eligible) return 'content_changed'
    }
  }
  if (spec.eventId !== undefined) {
    const found = await payload.count({ collection: 'events', where: { id: { equals: spec.eventId } }, overrideAccess: true })
    if (found.totalDocs !== 1) return 'content_changed'
  }
  if (spec.sponsorIds.length > 0) {
    const found = await payload.count({ collection: 'sponsors', where: { id: { in: spec.sponsorIds } }, overrideAccess: true })
    if (found.totalDocs !== spec.sponsorIds.length) return 'content_changed'
  }
  return null
}

/** Calls the adapter with a deadline. A timeout, an abort or a throw all mean the request may have been sent: outcome unknown. */
async function callAdapter(adapter: NetworkAdapter, input: Parameters<NetworkAdapter['publish']>[0], timeoutMs: number): Promise<PublishResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const aborted = new Promise<PublishResult>((resolve) => ctrl.signal.addEventListener('abort', () => resolve({ ok: false, outcome: 'unknown', reason: 'The network did not answer in time.', code: 'unknown_outcome' }), { once: true }))
    return await Promise.race([adapter.publish(input, ctrl.signal), aborted])
  } catch (err) {
    return { ok: false, outcome: 'unknown', reason: (err as Error).message || 'The request failed.', code: 'unknown_outcome' }
  } finally {
    clearTimeout(timer)
  }
}

async function processPost(payload: Payload, id: number, token: string, ignoreTime: boolean, opts: PublishOptions): Promise<void> {
  const env = opts.env ?? process.env
  const now = opts.now ?? new Date()
  const [post] = await rows(payload, sql`SELECT id, spec, approved_by_id, revision FROM "payload"."social_posts" WHERE id = ${id} AND claim_token = ${token} AND status = 'publishing'`)
  if (!post) return
  // A target still `publishing` belongs to a run that died: the outcome cannot be known, so it is never retried by itself.
  await rows(payload, sql`
    UPDATE "payload"."social_post_targets" SET status = 'unknown', error_code = 'run_stopped', last_error = ${REASONS.run_stopped}
    WHERE post_id = ${id} AND status = 'publishing' RETURNING id`)
  const due = (
    await rows(payload, sql`
      SELECT id, network, size, final_text, attempts FROM "payload"."social_post_targets"
      WHERE post_id = ${id} AND status = 'pending' AND final_text IS NOT NULL AND (${ignoreTime} OR next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY id`)
  ).map((r): TargetRow => ({ id: Number(r.id), network: String(r.network) as Network, size: String(r.size) as SizeKey, finalText: String(r.final_text), attempts: Number(r.attempts) }))
  if (due.length > 0) {
    const spec = post.spec as PostSpec
    const stale = await revalidate(payload, post.approved_by_id == null ? null : Number(post.approved_by_id), spec)
    if (stale) {
      for (const t of due) await failTarget(payload, t.id, stale)
    } else {
      const club = await getClub()
      const revision = Number(post.revision)
      for (const t of due) {
        const adapter = opts.adapters?.[t.network] ?? getAdapter(t.network, env)
        if (!adapter || !adapter.live) { await failTarget(payload, t.id, 'not_implemented'); continue }
        if (opts.verifyImage !== false) {
          const ok = await renderBytesFromSpec(spec, t.size).then((b) => b !== null).catch(() => false)
          if (!ok) { await failTarget(payload, t.id, 'render_failed'); continue }
        }
        // At most once: only the run that moves this target out of `pending` may call the network.
        const stepped = await rows(payload, sql`
          UPDATE "payload"."social_post_targets" SET status = 'publishing', attempts = attempts + 1
          WHERE id = ${t.id} AND status = 'pending' AND post_id = ${id} RETURNING attempts`)
        if (stepped.length !== 1) continue
        const attempts = Number(stepped[0].attempts)
        const result = await callAdapter(adapter, { postId: id, network: t.network, text: t.finalText, imageUrl: mintImageUrl(club.siteUrl, { postId: id, size: t.size, revision }) }, opts.timeoutMs ?? SOCIAL_ADAPTER_TIMEOUT_MS)
        await recordOutcome(payload, t.id, attempts, result, now, env)
      }
    }
  }
  const facts = await targetFacts(payload, id)
  const derived = derivePostStatus(facts, now)
  await finishPost(payload, id, token, derived)
}

async function recordOutcome(payload: Payload, targetId: number, attempts: number, r: PublishResult, now: Date, env: SocialEnv) {
  if (r.ok) {
    await rows(payload, sql`
      UPDATE "payload"."social_post_targets"
      SET status = 'published', remote_id = ${r.remoteId.slice(0, 200)}, remote_url = ${r.remoteUrl ? r.remoteUrl.slice(0, 500) : null}, published_at = now(), last_error = NULL, error_code = NULL, next_attempt_at = NULL
      WHERE id = ${targetId} AND status = 'publishing' RETURNING id`)
    return
  }
  const reason = storedReason(r.reason, env)
  const code = r.code ?? (r.outcome === 'unknown' ? 'unknown_outcome' : 'network')
  if (r.outcome === 'unknown') {
    console.warn(`[social] target ${targetId} outcome unknown: ${scrubSecrets(r.reason, env).slice(0, 200)}`)
    await rows(payload, sql`UPDATE "payload"."social_post_targets" SET status = 'unknown', error_code = ${code}, last_error = ${reason} WHERE id = ${targetId} AND status = 'publishing' RETURNING id`)
    return
  }
  const retryAt = r.retryable ? nextAttemptAt(now, attempts) : null
  if (retryAt) {
    await rows(payload, sql`UPDATE "payload"."social_post_targets" SET status = 'pending', next_attempt_at = ${retryAt.toISOString()}::timestamptz, error_code = ${code}, last_error = ${reason} WHERE id = ${targetId} AND status = 'publishing' RETURNING id`)
  } else {
    await failTarget(payload, targetId, code, reason, env, 'publishing')
  }
}

/** Claims what is due (or one post for "Post now") and publishes it. Safe to run concurrently with itself. */
export async function publishDue(payload: Payload, opts: PublishOptions = {}): Promise<PublishSummary> {
  const started = Date.now()
  const token = randomUUID()
  const ids = await claimDue(payload, token, { onlyId: opts.onlyId })
  const budget = opts.budgetMs ?? SOCIAL_RUN_BUDGET_MS
  for (const id of ids) {
    if (Date.now() - started > budget) {
      // Not started in time: give the claim back so the next run picks it up straight away instead of waiting out the lease.
      await rows(payload, sql`UPDATE "payload"."social_posts" SET status = 'scheduled', claim_token = NULL, claimed_at = NULL WHERE id = ${id} AND claim_token = ${token} RETURNING id`)
      continue
    }
    try {
      await processPost(payload, id, token, opts.onlyId !== undefined, opts)
    } catch (err) {
      // The claim stays; the lease will recover it, and its targets are never retried blindly.
      console.error(`[social] post ${id} stopped:`, scrubSecrets(err instanceof Error ? err.message : String(err), opts.env ?? process.env).slice(0, 300))
    }
  }
  const out = ids.length ? await rows(payload, sql`SELECT id, status FROM "payload"."social_posts" WHERE id = ANY(${sql.raw(`ARRAY[${ids.map(Number).join(',')}]::int[]`)}) ORDER BY id`) : []
  return { claimed: out.map((r) => ({ id: Number(r.id), status: String(r.status) })) }
}

