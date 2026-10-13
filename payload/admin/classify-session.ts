import type { Payload } from 'payload'
import { isSelectorUser, isSignedIn, isStaffUser } from '../access'
import { checkSession, sessionToken, type SessionCheck, type SessionUser } from './session-check'

/** What a custom admin view should do with whoever asked for it. */
export type Gate =
  | { kind: 'staff'; user: SessionUser | null; session: 'staff' | 'retried-ok' }
  | { kind: 'not-staff'; selector: boolean }
  | { kind: 'signed-out' }
  | { kind: 'error' }

type Loose = { role?: unknown; disabled?: unknown } | null | undefined

/**
 * Sorts a request into staff, not-staff, signed-out or error (wave G WP-0 spec section 2). Never decides from "is there a user" alone:
 * a null user is only "signed out" when there is no usable cookie or the second look says so; a lookup that throws is `error`.
 * The second look runs only after a null user with a cookie present, so a visitor with no cookie costs nothing.
 */
export async function classifySession(args: {
  user: Loose
  headers: Headers
  payload: Pick<Payload, 'secret' | 'config' | 'findByID' | 'collections'>
  check?: (payload: Pick<Payload, 'secret' | 'config' | 'findByID' | 'collections'>, headers: Headers) => Promise<SessionCheck>
}): Promise<Gate> {
  const { user, headers, payload } = args
  if (isStaffUser(user)) return { kind: 'staff', user: null, session: 'staff' }
  if (isSignedIn(user)) return { kind: 'not-staff', selector: isSelectorUser(user) }
  if (sessionToken(headers, payload.config) === null) return { kind: 'signed-out' }
  const second = await (args.check ?? checkSession)(payload, headers)
  if (second.outcome === 'error') return { kind: 'error' }
  if (second.outcome === 'signed-out') return { kind: 'signed-out' }
  if (isStaffUser(second.user)) return { kind: 'staff', user: second.user, session: 'retried-ok' }
  return { kind: 'not-staff', selector: isSelectorUser(second.user) }
}
