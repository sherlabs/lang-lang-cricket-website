import { sql } from '@payloadcms/db-postgres/drizzle'
import { createHash, randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { SELECTOR_INVITE_DAYS } from '@/config/site'

/**
 * Selector invitations (spec 3.4). An invite is a 32-byte random token whose SHA-256 is stored on the user row. Possession of a
 * valid, unexpired, unspent token is the only authority to claim a login for the first time (password or Facebook). Spending it
 * is one atomic UPDATE, so two requests racing on one link cannot both succeed.
 */

export const newInviteToken = (): string => randomBytes(32).toString('base64url')
export const hashInviteToken = (token: string): string => createHash('sha256').update(token).digest('hex')
/** A token has a fixed shape; anything else is rejected before touching the database. */
export const looksLikeInviteToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)

export function inviteWindow(now: Date = new Date(), days: number = SELECTOR_INVITE_DAYS): { expiresAt: string; invitedAt: string } {
  return { invitedAt: now.toISOString(), expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString() }
}

export type Invitee = { id: number; name: string | null; email: string }

/** The selector an open invite belongs to, or null (wrong, expired, spent, disabled, or not a selector). Does not spend it. */
export async function findInvitee(payload: Payload, token: unknown): Promise<Invitee | null> {
  if (!looksLikeInviteToken(token)) return null
  const hash = hashInviteToken(token)
  const res = await payload.db.drizzle.execute(
    sql`SELECT id, name, email FROM "payload"."users" WHERE invite_token_hash = ${hash} AND invite_expires_at > now() AND role = 'selector' AND NOT COALESCE(disabled, false) LIMIT 1`,
  )
  const row = res.rows[0] as { id: number; name: string | null; email: string } | undefined
  return row ? { id: Number(row.id), name: row.name, email: row.email } : null
}

/**
 * Spends the invite atomically and returns the user it belonged to (null when it was wrong, expired, already spent or the account
 * is disabled). With `facebookId` the link is written in the same statement, so a Facebook id already bound elsewhere (unique
 * index) throws and the invite stays open.
 */
export async function consumeInvite(payload: Payload, token: unknown, opts: { facebookId?: string; via?: 'own' | 'broker' } = {}): Promise<Invitee | null> {
  if (!looksLikeInviteToken(token)) return null
  const hash = hashInviteToken(token)
  const bind = opts.facebookId ? sql`, facebook_id = ${opts.facebookId}, facebook_id_via = ${opts.via ?? 'own'}, facebook_linked_at = now()` : sql``
  const guard = opts.facebookId ? sql` AND facebook_id IS NULL` : sql``
  const res = await payload.db.drizzle.execute(
    sql`UPDATE "payload"."users" SET invite_token_hash = NULL, invite_expires_at = NULL${bind} WHERE invite_token_hash = ${hash} AND invite_expires_at > now() AND role = 'selector' AND NOT COALESCE(disabled, false)${guard} RETURNING id, name, email`,
  )
  const row = res.rows[0] as { id: number; name: string | null; email: string } | undefined
  return row ? { id: Number(row.id), name: row.name, email: row.email } : null
}
