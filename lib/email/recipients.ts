import 'server-only'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { Payload } from 'payload'

/** Erasure: blanks the snapshots held for one member in every campaign, immediately. The rows, statuses and counts stay. Throws if the table cannot be reached. */
export async function scrubMemberRecipients(payload: Payload, memberId: number): Promise<void> {
  await payload.db.drizzle.execute(sql`UPDATE "payload"."email_recipients" SET "email" = NULL, "first_name" = NULL, "provider_id" = NULL, "error" = NULL, "updated_at" = now() WHERE "member_id" = ${memberId}`)
}
