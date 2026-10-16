import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'
import { emailHash, normaliseAddress } from './unsub-token'

type Row = Record<string, unknown>
const rows = async (payload: Payload, q: ReturnType<typeof sql>): Promise<Row[]> => ((await payload.db.drizzle.execute(q)) as unknown as { rows: Row[] }).rows

export type SuppressionReason = 'unsubscribed' | 'manual' | 'bounced' | 'complaint'

/** Adds an address to the list. Idempotent: an address already on the list keeps its first row (and its first reason). */
export async function addSuppression(payload: Payload, input: { emailHash: string; email: string | null; reason: SuppressionReason; source: string; campaignId?: number | null }): Promise<{ created: boolean }> {
  const out = await rows(
    payload,
    sql`INSERT INTO "payload"."email_suppressions" ("email_hash", "email", "reason", "source", "at", "campaign_id", "created_at", "updated_at")
        VALUES (${input.emailHash}, ${input.email ? normaliseAddress(input.email) : null}, ${input.reason}::"payload"."enum_email_suppressions_reason", ${input.source.slice(0, 60)}, now(), ${input.campaignId ?? null}, now(), now())
        ON CONFLICT ("email_hash") DO NOTHING RETURNING id`,
  )
  return { created: out.length === 1 }
}

export const addSuppressionForAddress = (payload: Payload, email: string, reason: SuppressionReason, source: string, campaignId?: number | null) =>
  addSuppression(payload, { emailHash: emailHash(email), email, reason, source, campaignId })

/** The undo: removes an `unsubscribed` entry only. A bounce, a complaint or an admin's entry is never cleared this way. */
export async function removeUnsubscribed(payload: Payload, hash: string): Promise<number> {
  return (await rows(payload, sql`DELETE FROM "payload"."email_suppressions" WHERE "email_hash" = ${hash} AND "reason" = 'unsubscribed' RETURNING id`)).length
}

/** Which of these address hashes are on the list. */
export async function suppressedHashes(payload: Payload, hashes: readonly string[]): Promise<Set<string>> {
  const out = new Set<string>()
  for (let i = 0; i < hashes.length; i += 400) {
    const chunk = hashes.slice(i, i + 400)
    if (chunk.length === 0) continue
    const found = await payload.find({ collection: 'email-suppressions', where: { emailHash: { in: chunk } }, pagination: false, depth: 0, select: { emailHash: true }, overrideAccess: true })
    for (const d of found.docs as unknown as { emailHash: string }[]) out.add(d.emailHash)
  }
  return out
}
