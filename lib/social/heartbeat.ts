import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { smoothInterval } from './heartbeat-math'

type Row = Record<string, unknown>
const rows = async (payload: Payload, q: ReturnType<typeof sql>): Promise<Row[]> => ((await payload.db.drizzle.execute(q)) as unknown as { rows: Row[] }).rows

/**
 * Written on every authorised cron run, even when nothing is due (spec 4.7), with explicit SQL: the fields are server-owned
 * (`update: nobodyField`) so the Local API with access on could not write them. A global never saved has no row yet, so the first
 * call creates it through the Local API.
 */
export async function recordHeartbeat(payload: Payload): Promise<void> {
  let current = await rows(payload, sql`SELECT id, last_cron_run_at, observed_cron_interval_minutes FROM "payload"."social_settings" ORDER BY id LIMIT 1`)
  if (current.length === 0) {
    await payload.updateGlobal({ slug: 'social-settings', data: {}, overrideAccess: true, depth: 0 })
    current = await rows(payload, sql`SELECT id, last_cron_run_at, observed_cron_interval_minutes FROM "payload"."social_settings" ORDER BY id LIMIT 1`)
  }
  const row = current[0]
  if (!row) return
  const last = row.last_cron_run_at ? new Date(String(row.last_cron_run_at)) : null
  const prev = row.observed_cron_interval_minutes == null ? null : Number(row.observed_cron_interval_minutes)
  const gap = last ? (Date.now() - last.getTime()) / 60_000 : null
  const next = smoothInterval(prev, gap)
  await rows(payload, sql`UPDATE "payload"."social_settings" SET last_cron_run_at = now(), observed_cron_interval_minutes = ${next}::numeric WHERE id = ${Number(row.id)} RETURNING id`)
}

/** `scheduledCount` is the scheduled posts that are already due: a post for next week cannot be late, so it never makes the scheduler look stale. */
export type HeartbeatFacts = { lastRunAt: Date | null; observedMinutes: number | null; scheduledCount: number; overdueCount: number }

export async function readHeartbeat(payload: Payload, overdueAfterMinutes: (observed: number | null) => number): Promise<HeartbeatFacts> {
  const h = (await rows(payload, sql`SELECT last_cron_run_at, observed_cron_interval_minutes FROM "payload"."social_settings" ORDER BY id LIMIT 1`))[0]
  const observed = h?.observed_cron_interval_minutes == null ? null : Number(h.observed_cron_interval_minutes)
  const limit = overdueAfterMinutes(observed)
  const c = (await rows(payload, sql`
    SELECT count(*) FILTER (WHERE next_run_at <= now())::int AS scheduled, count(*) FILTER (WHERE next_run_at < now() - make_interval(mins => ${limit}::int))::int AS overdue
    FROM "payload"."social_posts" WHERE status = 'scheduled'`))[0]
  return { lastRunAt: h?.last_cron_run_at ? new Date(String(h.last_cron_run_at)) : null, observedMinutes: observed, scheduledCount: Number(c?.scheduled ?? 0), overdueCount: Number(c?.overdue ?? 0) }
}
