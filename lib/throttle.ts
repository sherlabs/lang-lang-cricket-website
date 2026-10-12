import { sql } from '@payloadcms/db-postgres/drizzle'
import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'
import { deriveKey, HKDF_LABELS } from './secrets'

/**
 * Rate limits that work on serverless (spec 4.4): no in-memory counters, one atomic `INSERT ... ON CONFLICT DO UPDATE` per hit,
 * so concurrent requests cannot both read the old count. Keys are hashed (HKDF label `throttle-key`) so the table holds no names
 * or addresses. After `limit` hits inside `windowMs` the key locks for `lockMs`, doubling per further strike up to one hour
 * (a day-long lock keyed on a claimed name would let anyone lock a named person out).
 */
export type ThrottleRule = { limit: number; windowMs: number; lockMs: number }
export type ThrottleResult = { allowed: boolean; retryAfterSeconds: number }

const CAP_MS = 3_600_000

export const hashKey = (key: string, secret?: string): string => createHmac('sha256', deriveKey(HKDF_LABELS.throttle, secret)).update(key).digest('hex')

type Row = { locked: boolean; retry: number | string | null }

const toResult = (row: Row | undefined): ThrottleResult => {
  const retry = row?.retry == null ? 0 : Math.max(0, Math.min(CAP_MS / 1000, Math.ceil(Number(row.retry) - 0.001)))
  return { allowed: !row?.locked, retryAfterSeconds: row?.locked ? retry : 0 }
}

/** Counts one attempt on `key`. Returns allowed false while the key is locked (including the attempt that trips it). */
export async function hit(payload: Payload, key: string, rule: ThrottleRule): Promise<ThrottleResult> {
  const k = hashKey(key)
  const { limit, windowMs, lockMs } = rule
  const res = await payload.db.drizzle.execute(sql`
    INSERT INTO "payload"."throttle_hits" AS t ("key", "count", "window_start", "strikes", "locked_until", "created_at", "updated_at")
    VALUES (${k}, 1, now(), 0, ${limit < 1 ? sql`now() + (${lockMs} * interval '1 millisecond')` : sql`NULL`}, now(), now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN t.locked_until > now() THEN t.count
        WHEN t.window_start < now() - (${windowMs} * interval '1 millisecond') THEN 1
        WHEN t.count + 1 > ${limit} THEN 0
        ELSE t.count + 1 END,
      "window_start" = CASE
        WHEN t.locked_until > now() THEN t.window_start
        WHEN t.window_start < now() - (${windowMs} * interval '1 millisecond') OR t.count + 1 > ${limit} THEN now()
        ELSE t.window_start END,
      "locked_until" = CASE
        WHEN t.locked_until > now() THEN t.locked_until
        WHEN t.window_start >= now() - (${windowMs} * interval '1 millisecond') AND t.count + 1 > ${limit}
          THEN now() + (LEAST(${lockMs} * power(2, t.strikes), ${CAP_MS}) * interval '1 millisecond')
        ELSE NULL END,
      "strikes" = CASE
        WHEN t.locked_until > now() THEN t.strikes
        WHEN t.window_start >= now() - (${windowMs} * interval '1 millisecond') AND t.count + 1 > ${limit} THEN t.strikes + 1
        ELSE t.strikes END,
      "updated_at" = now()
    RETURNING (t.locked_until IS NOT NULL AND t.locked_until > now()) AS locked, EXTRACT(EPOCH FROM (t.locked_until - now())) AS retry
  `)
  return toResult(res.rows[0] as Row | undefined)
}

/** Is `key` locked right now? Does not count. */
export async function isLocked(payload: Payload, key: string): Promise<ThrottleResult> {
  const res = await payload.db.drizzle.execute(sql`
    SELECT (locked_until IS NOT NULL AND locked_until > now()) AS locked, EXTRACT(EPOCH FROM (locked_until - now())) AS retry
    FROM "payload"."throttle_hits" WHERE "key" = ${hashKey(key)}`)
  return toResult(res.rows[0] as Row | undefined)
}

/** Forgets a key (a correct credential). */
export async function clear(payload: Payload, key: string): Promise<void> {
  await payload.db.drizzle.execute(sql`DELETE FROM "payload"."throttle_hits" WHERE "key" = ${hashKey(key)}`)
}

/** Rows idle for two days are deleted (called from the daily players-sync cron). */
export async function sweep(payload: Payload): Promise<void> {
  await payload.db.drizzle.execute(sql`DELETE FROM "payload"."throttle_hits" WHERE "updated_at" < now() - interval '2 days'`)
}

/** The soft per-IP rules for the selector routes: 60 per 10 minutes, a 10-minute pause. Skipped (allowed) when there is no trusted IP. */
export const IP_RULE: ThrottleRule = { limit: 60, windowMs: 600_000, lockMs: 600_000 }

/**
 * Rules for buckets that are not the soft default. `unsub-bad` counts only failed unsubscribe-link checks (a valid link is never
 * counted), `vol-bad` is the same for volunteer links, `unsub-undo` is the undo button, `rest-forgot` the forgot-password request.
 */
export const BUCKET_RULES: Partial<Record<IpBucket, ThrottleRule>> = {
  'unsub-bad': { limit: 30, windowMs: 600_000, lockMs: 600_000 },
  'vol-bad': { limit: 30, windowMs: 600_000, lockMs: 600_000 },
  'unsub-undo': { limit: 60, windowMs: 600_000, lockMs: 300_000 },
  'rest-forgot': { limit: 10, windowMs: 600_000, lockMs: 600_000 },
}

/** Forgot-password requests for one address: a few per hour, whether or not the address has an account. */
export const FORGOT_ADDRESS_RULE: ThrottleRule = { limit: 3, windowMs: 3_600_000, lockMs: 900_000 }

export type IpBucket = 'sel-login' | 'sel-oauth' | 'sel-invite' | 'rest-login' | 'avail' | 'vol-bad' | 'rest-forgot' | 'unsub-bad' | 'unsub-undo'

export async function ipHit(payload: Payload, bucket: IpBucket, ip: string | null): Promise<ThrottleResult> {
  if (!ip) return { allowed: true, retryAfterSeconds: 0 }
  return hit(payload, `${bucket}:ip:${ip}`, BUCKET_RULES[bucket] ?? IP_RULE)
}
