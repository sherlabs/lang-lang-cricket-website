import 'server-only'
import type { TypedUser } from 'payload'
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
