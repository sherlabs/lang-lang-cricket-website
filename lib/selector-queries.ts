import 'server-only'
import type { Payload, TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { passwordIsRight } from '@/lib/password-check'
import { isSelectionUser, isSelectorUser } from '@/payload/access'

/**
 * The one reviewed place where selector-area code reads or writes with `overrideAccess: true` (a guard test bans it under
 * `app/(frontend)/selector/**`). Every function takes the already-verified user and re-checks the role itself.
 */

export type OwnAccount = { name: string; email: string; role: string; facebookLinked: boolean; hasPassword: boolean }

export async function getOwnAccount(user: TypedUser): Promise<OwnAccount | null> {
  if (!isSelectionUser(user)) return null
  const payload = await getPayloadClient()
  const row = await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true, showHiddenFields: true, select: { name: true, email: true, role: true, facebookLinkedAt: true, passwordChosenAt: true } })
  // Admins and editors always have a password; a selector only once they (or the committee for them) chose one.
  return { name: row.name ?? '', email: row.email, role: row.role, facebookLinked: Boolean(row.facebookLinkedAt), hasPassword: row.role !== 'selector' || Boolean(row.passwordChosenAt) }
}

/** A selector removes their own Facebook link. Refused (false) when they have no password, which would lock them out. */
export async function unlinkOwnFacebook(user: TypedUser): Promise<boolean> {
  if (!isSelectorUser(user)) return false
  const payload = await getPayloadClient()
  const account = await getOwnAccount(user)
  if (!account?.hasPassword) return false
  await payload.update({ collection: 'users', id: user.id, data: { facebookId: null }, overrideAccess: true, context: { disableRevalidate: true } })
  return true
}

/** True when `current` is this account's password. Counts towards the lockout like a login does. */
export async function currentPasswordIsRight(payload: Payload, email: string, current: string): Promise<boolean> {
  return passwordIsRight(payload, email, current)
}

/**
 * A selector who never chose a password (a Facebook-invited one) chooses their first. The live session is the authority, so no
 * current password is asked for; it is refused once one exists (they must then use the change form, which asks for it).
 */
export async function chooseFirstPassword(user: TypedUser, password: string): Promise<boolean> {
  const account = await getOwnAccount(user)
  if (!account || account.role !== 'selector' || account.hasPassword) return false
  const payload = await getPayloadClient()
  await payload.update({ collection: 'users', id: user.id, data: { password }, user, overrideAccess: true, context: { disableRevalidate: true, skipCurrentPassword: true } })
  return true
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
