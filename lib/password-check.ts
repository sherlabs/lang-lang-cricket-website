import type { Payload } from 'payload'

/**
 * True when `password` is the account's current password. Uses Payload's own login so a wrong guess counts towards the account
 * lockout exactly as a real sign-in does, but leaves no trace of a sign-in: the `afterLogin` stamp is skipped (`passwordCheck`
 * context) and the session entry the login created is removed again, so a Facebook-signed-in selector who changes their password
 * is not shown as a password sign-in and gets no extra session.
 */
export async function passwordIsRight(payload: Payload, email: string, password: string): Promise<boolean> {
  const sessionIds = async (): Promise<string[]> => {
    const res = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, pagination: false, showHiddenFields: true, overrideAccess: true })
    return ((res.docs[0] as { sessions?: { id: string }[] } | undefined)?.sessions ?? []).map((s) => s.id)
  }
  const before = new Set(await sessionIds())
  try {
    await payload.login({ collection: 'users', data: { email, password }, context: { passwordCheck: true } })
  } catch {
    return false
  }
  const res = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, pagination: false, showHiddenFields: true, overrideAccess: true })
  const doc = res.docs[0] as { id: number; sessions?: { id: string }[] } | undefined
  if (doc?.sessions?.some((s) => !before.has(s.id))) {
    await payload.db.updateOne({ collection: 'users', id: doc.id, data: { sessions: doc.sessions.filter((s) => before.has(s.id)) }, returning: false })
  }
  return true
}
