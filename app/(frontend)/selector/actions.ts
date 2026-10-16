'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { generatePayloadCookie, generateExpiredPayloadCookie } from 'payload/shared'
import { selectorPaths } from '@/config/site'
import { clientIp } from '@/lib/client-ip'
import { getPayloadClient } from '@/lib/payload/client'
import { safeNext } from '@/lib/safe-next'
import { requireSelection } from '@/lib/selector-auth'
import type { FormState } from '@/lib/selector-form-state'
import { consumeInvite, looksLikeInviteToken } from '@/lib/selector-invite'
import { chooseFirstPassword, currentPasswordIsRight, getOwnAccount, removeOwnSession, setPasswordFromInvite, unlinkOwnFacebook } from '@/lib/selector-queries'
import { mintSelectorSession } from '@/lib/selector-session'
import { MIN_PASSWORD_LENGTH } from '@/lib/selector-status'
import { ipHit } from '@/lib/throttle'

/**
 * Selector server actions. Each one is a public POST, so each re-derives who is calling (`requireSelection`) or, for the two
 * pre-login ones, validates its own input. No action in this folder passes `overrideAccess: true`: privileged writes live in
 * `lib/selector-queries.ts` (a guard test enforces it: any create, update, delete, find or db call here must say `overrideAccess: false`).
 */
const BAD_LOGIN = 'Email or password is not right.'
const BUSY = 'Too many tries. Please wait a few minutes and try again.'

type LoggedIn = { token?: string | null }

/** Sets the same `payload-token` cookie Payload's own login would. */
async function setSessionCookie(result: LoggedIn): Promise<void> {
  if (!result.token) throw new Error('no token')
  const payload = await getPayloadClient()
  const cfg = payload.collections.users.config
  const c = generatePayloadCookie({ collectionAuthConfig: cfg.auth, cookiePrefix: payload.config.cookiePrefix, token: result.token, returnCookieAsObject: true })
  ;(await cookies()).set({
    name: c.name,
    value: c.value ?? '',
    httpOnly: c.httpOnly,
    sameSite: c.sameSite?.toLowerCase() as 'lax' | 'strict' | 'none' | undefined,
    secure: c.secure,
    path: c.path,
    expires: c.expires ? new Date(c.expires) : undefined,
  })
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))
  if (!email || !password || email.length > 200 || password.length > 500) return { error: BAD_LOGIN }
  const payload = await getPayloadClient()
  if (!(await ipHit(payload, 'sel-login', clientIp(await headers()))).allowed) return { error: BUSY }
  try {
    // Payload's own lockout applies (5 tries, 10 minutes). Every failure, a disabled or locked account included, says the same thing.
    const result = await payload.login({ collection: 'users', data: { email, password } })
    await setSessionCookie(result)
  } catch {
    return { error: BAD_LOGIN }
  }
  redirect(next)
}

export async function logoutAction(): Promise<void> {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: await headers() })
  if (user !== null) await removeOwnSession(payload, user)
  const cfg = payload.collections.users.config
  const c = generateExpiredPayloadCookie({ collectionAuthConfig: cfg.auth, cookiePrefix: payload.config.cookiePrefix, returnCookieAsObject: true })
  ;(await cookies()).set({ name: c.name, value: '', path: c.path ?? '/', expires: new Date(0), httpOnly: true, secure: c.secure, sameSite: 'lax' })
  redirect(selectorPaths.login)
}

/** The invite page's "Choose a password": spends the invite atomically FIRST, so two requests on one link cannot both set a password. */
export async function chooseInvitePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = formData.get('token')
  const password = String(formData.get('password') ?? '')
  if (!looksLikeInviteToken(token)) return { error: 'This link has expired. Ask the committee for a new one.' }
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.` }
  if (password !== String(formData.get('confirm') ?? '')) return { error: 'The two passwords are not the same.' }
  const payload = await getPayloadClient()
  if (!(await ipHit(payload, 'sel-invite', clientIp(await headers()))).allowed) return { error: BUSY }
  const invitee = await consumeInvite(payload, token)
  if (!invitee) return { error: 'This link has expired. Ask the committee for a new one.' }
  try {
    // The invitee has no password anyone knows yet; this is the first one (the spent invite is the authority).
    await setPasswordFromInvite(payload, invitee, password)
    // Not `payload.login`: a lockout (five bad REST tries by someone else) must not turn a spent invite into a dead end. Minting resets it.
    const session = await mintSelectorSession(payload, invitee.id, 'password')
    await setSessionCookie(session)
  } catch {
    return { error: 'Something went wrong. Ask the committee for a new invite link.' }
  }
  redirect(selectorPaths.home)
}

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireSelection(selectorPaths.account)
  const current = String(formData.get('current') ?? '')
  const password = String(formData.get('password') ?? '')
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.` }
  if (password !== String(formData.get('confirm') ?? '')) return { error: 'The two passwords are not the same.' }
  const payload = await getPayloadClient()
  const account = await getOwnAccount(user)
  if (!account) return { error: 'Your current password is not right, or the new one is too short.' }
  try {
    if (!account.hasPassword) {
      // A Facebook-invited selector has no password yet: the signed-in session is enough to choose the first one.
      if (!(await chooseFirstPassword(user, password))) return { error: 'Something went wrong. Please try again.' }
      return { ok: 'Password saved. You can now sign in with your email and password too.' }
    }
    // Everyone else (staff included) proves the current password first; the collection hook only guards selectors.
    if (!current || !(await currentPasswordIsRight(payload, account.email, current))) return { error: 'Your current password is not right, or the new one is too short.' }
    await payload.update({ collection: 'users', id: user.id, data: { password }, user, overrideAccess: false, context: { disableRevalidate: true, skipCurrentPassword: true } })
  } catch {
    return { error: 'Your current password is not right, or the new one is too short.' }
  }
  return { ok: 'Password changed. Other devices are signed out.' }
}

export async function unlinkFacebookAction(): Promise<void> {
  const user = await requireSelection(selectorPaths.account)
  // Refused without a password: unlinking would leave no way to sign in.
  await unlinkOwnFacebook(user)
  redirect(selectorPaths.account)
}
