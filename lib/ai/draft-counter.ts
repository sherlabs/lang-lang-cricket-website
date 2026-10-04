import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { CLUB_TIMEZONE } from '@/config/site'

/**
 * One site-wide daily counter for AI drafts (W2 spec 6.5): a single row per day, incremented atomically with
 * `INSERT ... ON CONFLICT DO UPDATE ... WHERE count < limit RETURNING`, so two concurrent calls cannot both pass the limit.
 * There is no per-yearbook cooldown. The Gateway spend limit is the backstop.
 */
export const draftDay = (now: Date = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: CLUB_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

/** True when this call may proceed (and is now counted). */
export async function claimDraft(payload: Payload, limit: number, now: Date = new Date()): Promise<boolean> {
  const stamp = now.toISOString()
  const res = await payload.db.drizzle.execute(
    sql`INSERT INTO "payload"."ai_draft_counter" ("day", "count", "updated_at", "created_at") VALUES (${draftDay(now)}, 1, ${stamp}, ${stamp})
        ON CONFLICT ("day") DO UPDATE SET "count" = "ai_draft_counter"."count" + 1, "updated_at" = ${stamp}
        WHERE "ai_draft_counter"."count" < ${limit}
        RETURNING "count"`,
  )
  return ((res as unknown as { rows?: unknown[] }).rows?.length ?? 0) > 0
}

/** Gives a counted draft back (the model call failed, so the admin should not lose one of the day's drafts). */
export async function releaseDraft(payload: Payload, now: Date = new Date()): Promise<void> {
  await payload.db.drizzle.execute(
    sql`UPDATE "payload"."ai_draft_counter" SET "count" = GREATEST("count" - 1, 0) WHERE "day" = ${draftDay(now)}`,
  )
}
