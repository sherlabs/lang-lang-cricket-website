import { getFieldsToSign, jwtSign, resetLoginAttempts, createLocalReq, type Payload, type PayloadRequest } from 'payload'
// `addSessionToUser` and `generatePayloadCookie` are exported from `payload/shared` only (3.90.2).
import { addSessionToUser, generatePayloadCookie } from 'payload/shared'

/**
 * Signs a selector in WITHOUT a password and returns the `Set-Cookie` string for the same `payload-token` cookie that
 * `payload.auth()`, `/api/users/me` and every access function already understand (spec 3.5.1). It does exactly what Payload's own
 * `login` does after the password check: a new session id (`sid`), a signed JWT carrying it, the cookie, login-attempt reset.
 *
 * PINNED TO PAYLOAD 3.90.2. Payload has no public "sign this user in" API; these are internal primitives. The spike test
 * (`tests/int/selector-session.int.test.ts`) fails loudly if an upgrade moves or changes them; re-verify it on every upgrade.
 *
 * Only a `selector` row can be minted: admins and editors keep password login, so an identity match elsewhere can never
 * become a passwordless `/admin` session.
 */
export class SessionMintError extends Error {}

export async function mintSelectorSession(payload: Payload, userId: number | string, method: 'password' | 'facebook'): Promise<{ cookie: string; token: string }> {
  const collectionConfig = payload.collections.users.config
  const doc = (await payload.db.findOne({ collection: 'users', where: { id: { equals: userId } } })) as (Record<string, unknown> & { id: number | string; email: string; role?: string; disabled?: boolean }) | null
  if (!doc) throw new SessionMintError('no such user')
  if (doc.role !== 'selector') throw new SessionMintError('only selectors can be signed in without a password')
  if (doc.disabled) throw new SessionMintError('disabled')
  const req = await createLocalReq({}, payload)
  // Every session is new: any earlier payload-token in the browser is overwritten by this cookie, never reused.
  const { sid } = await addSessionToUser({ collectionConfig, payload, req, user: doc as never })
  // Sessions off would silently mint a cookie that never expires server-side.
  if (!sid) throw new SessionMintError('sessions are not enabled on users')
  const fieldsToSign = getFieldsToSign({ collectionConfig, email: doc.email, sid, user: doc as never })
  const { token } = await jwtSign({ fieldsToSign, secret: payload.secret, tokenExpiration: collectionConfig.auth.tokenExpiration })
  const cookie = generatePayloadCookie({ collectionAuthConfig: collectionConfig.auth, cookiePrefix: payload.config.cookiePrefix, token })
  await resetLoginAttempts({ collection: collectionConfig, doc: doc as never, payload, req: req as PayloadRequest })
  await payload.db.updateOne({ collection: 'users', id: doc.id, data: { lastLoginAt: new Date().toISOString(), lastLoginMethod: method }, req, returning: false })
  return { cookie, token }
}
