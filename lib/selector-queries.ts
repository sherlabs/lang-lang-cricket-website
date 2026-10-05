import 'server-only'
import type { Payload, TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { isSelectionUser, isSelectorUser } from '@/payload/access'

/**
 * The one reviewed place where selector-area code reads or writes with `overrideAccess: true` (a guard test bans it under
 * `app/(frontend)/selector/**`). Every function takes the already-verified user and re-checks the role itself.
 */

export type OwnAccount = { name: string; email: string; role: string; facebookLinked: boolean }

export async function getOwnAccount(user: TypedUser): Promise<OwnAccount | null> {
  if (!isSelectionUser(user)) return null
  const payload = await getPayloadClient()
  const row = await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true, select: { name: true, email: true, role: true, facebookLinkedAt: true } })
  return { name: row.name ?? '', email: row.email, role: row.role, facebookLinked: Boolean(row.facebookLinkedAt) }
}

/** A selector removes their own Facebook link; they can still sign in with their password. */
export async function unlinkOwnFacebook(user: TypedUser): Promise<void> {
  if (!isSelectorUser(user)) return
  const payload = await getPayloadClient()
  await payload.update({ collection: 'users', id: user.id, data: { facebookId: null }, overrideAccess: true, context: { disableRevalidate: true } })
}

/**
 * Sets the very first password of a selector whose invite was just spent. The spent invite (an atomic, single-use token) is the
 * authority, so this runs with the Local API's default access override; the collection hooks still apply the length rule.
 */
export async function setPasswordFromInvite(payload: Payload, invitee: { id: number }, password: string): Promise<void> {
  await payload.update({ collection: 'users', id: invitee.id, data: { password }, overrideAccess: true, context: { disableRevalidate: true, skipCurrentPassword: true } })
}

/** Signs one browser out: removes only the caller's own session id, so a phone stays signed in when the laptop signs out. */
export async function removeOwnSession(payload: Payload, user: TypedUser): Promise<void> {
  const sid = (user as unknown as { _sid?: string })._sid
  if (!sid) return
  const row = (await payload.db.findOne({ collection: 'users', where: { id: { equals: user.id } } })) as { sessions?: Array<{ id: string }> } | null
  if (!row) return
  await payload.db.updateOne({ collection: 'users', id: user.id, data: { sessions: (row.sessions ?? []).filter((s) => s.id !== sid) }, returning: false })
}
