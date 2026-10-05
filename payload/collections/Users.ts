import { APIError, AuthenticationError, Forbidden, ValidationError, type CollectionAfterChangeHook, type CollectionBeforeChangeHook, type CollectionBeforeValidateHook, type CollectionConfig, type Where } from 'payload'
import { clientIp } from '../../lib/client-ip'
import { MIN_PASSWORD_LENGTH } from '../../lib/selector-status'
import { ipHit } from '../../lib/throttle'
import { isAdminField, isAdminUser, isSelectorUser, isStaff, isStaffUser, isSignedIn, nobodyField, type Role } from '../access'
import { adminOnlyCondition, hiddenFromEditors } from '../admin/visibility'

/**
 * Users (spec 2026-10-05-announce-teams-design.md sections 2, 3.1 to 3.3). Three roles: `admin`, `editor` (the committee) and
 * `selector` (picks the teams; created from the admin, signs in with Facebook or a password, never opens `/admin`).
 * Selectors are rows in `users` because Payload 3.90 has one global auth cookie name: a second auth collection would fight over it.
 *
 * Privilege rules live in `beforeOperation` on purpose: it sees the raw request body BEFORE field access silently drops a field,
 * so an escalation attempt gets a visible 403 instead of being ignored. Server code that must write a privileged field (invite
 * token, Facebook link) passes `req.context` flags that REST callers cannot set.
 */

const SELECTOR_ROLE: Role = 'selector'
const selfOrSelectors = (id: unknown): Where => ({ or: [{ id: { equals: id as number } }, { role: { equals: SELECTOR_ROLE } }] })
const selfOnly = (id: unknown): Where => ({ id: { equals: id as number } })

/** The keys a request may carry, by actor and operation. Everything else is dropped; role and the selector-only keys are refused. */
const CREATE_KEYS = ['email', 'password', 'name', 'role']
const EDITOR_UPDATE_KEYS = ['email', 'password', 'currentPassword', 'name', 'disabled', 'facebookId']
const SELECTOR_UPDATE_KEYS = ['password', 'currentPassword', 'name']
/** A selector (or editor) naming one of these is a privilege-escalation attempt: refuse loudly. */
const SELECTOR_FORBIDDEN_KEYS = ['email', 'role', 'disabled', 'facebookId']

type Body = Record<string, unknown>

const dropOthers = (data: Body, allowed: string[]): void => {
  for (const key of Object.keys(data)) if (!allowed.includes(key)) delete data[key]
}

export type SelectorInviteContext = { hash: string; expiresAt: string; invitedAt: string }

const accessAdmin = ({ req }: { req: { user?: unknown } }): boolean => isStaffUser(req.user as never)

const beforeOperationGuard: NonNullable<NonNullable<CollectionConfig['hooks']>['beforeOperation']>[number] = async ({ operation, req, args }) => {
  if (operation === 'login') {
    // Soft per-IP cap on the REST login route (the selector form has its own bucket). No trusted IP (local dev, Local API) means no cap.
    const ip = clientIp(req.headers ?? new Headers())
    if (ip && !(await ipHit(req.payload, 'rest-login', ip)).allowed) throw new APIError('Too many tries. Please wait a few minutes and try again.', 429, null, true)
    return args
  }
  if (operation === 'create' && !isSignedIn(req.user) && !req.context?.seedAdmin) {
    // First-register is closed structurally: `registerFirstUser` creates with overrideAccess, so `access.create` cannot stop it.
    throw new Forbidden(req.t)
  }
  if (operation === 'forgotPassword') {
    // Forgot-password is disabled: there is no email adapter, so Payload would write the reset link and token to the server logs.
    throw new APIError('Password reset by email is not available. Ask an admin to set a new password.', 403, null, true)
  }
  const user = req.user
  if (!isSignedIn(user) || isAdminUser(user) || (operation !== 'create' && operation !== 'update')) return args
  const data = (args as { data?: Body }).data
  if (!data || typeof data !== 'object') return args
  if (isSelectorUser(user)) {
    // A selector never creates users, and updates only their own name and password (access already limits the target to self).
    if (SELECTOR_FORBIDDEN_KEYS.some((k) => k in data)) throw new Forbidden(req.t)
    dropOthers(data, SELECTOR_UPDATE_KEYS)
    return args
  }
  if (!isStaffUser(user)) throw new Forbidden(req.t)
  // Editor. `role` is never theirs to choose: omit it (a selector is created) or send `selector`.
  if (operation === 'create') {
    if ('role' in data && data.role !== SELECTOR_ROLE) throw new Forbidden(req.t)
    dropOthers(data, CREATE_KEYS)
    return args
  }
  if ('role' in data) throw new Forbidden(req.t)
  dropOthers(data, EDITOR_UPDATE_KEYS)
  return args
}

/** Editors may only create selectors: the default role is `editor`, so omitting `role` must not create one. */
const forceSelectorForEditor: CollectionBeforeValidateHook = ({ data, operation, req }) => {
  if (!data) return data
  if (operation === 'create' && isStaffUser(req.user) && !isAdminUser(req.user)) data.role = SELECTOR_ROLE
  return data
}

/** A password shorter than the minimum is refused on every path (REST, endpoints, admin form, Local API). */
const passwordRules: CollectionBeforeValidateHook = ({ data }) => {
  if (data && typeof data.password === 'string' && data.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError({ errors: [{ message: `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`, path: 'password' }] })
  }
  return data
}

/**
 * A selector changing their own password must send `currentPassword`, checked with the same comparison as login (so failures
 * also count towards the lockout). The committee's "Set a password" endpoint is the only way to set one without it.
 */
const requireCurrentPassword: CollectionBeforeValidateHook = async ({ data, operation, originalDoc, req }) => {
  if (!data || operation !== 'update' || typeof data.password !== 'string') return data
  const current = (data as Body).currentPassword
  delete (data as Body).currentPassword
  if (!isSelectorUser(req.user) || req.context?.skipCurrentPassword) return data
  const email = (originalDoc as { email?: string } | undefined)?.email
  if (typeof current !== 'string' || !email) throw new ValidationError({ errors: [{ message: 'Enter your current password to choose a new one.', path: 'currentPassword' }] })
  try {
    await req.payload.login({ collection: 'users', data: { email, password: current } })
  } catch {
    throw new ValidationError({ errors: [{ message: 'Your current password is not right.', path: 'currentPassword' }] })
  }
  return data
}

/**
 * Records that a person chose a password (the committee's random placeholder at creation does not count; it passes
 * `req.context.randomPassword`). Facebook-invited selectors have none until they choose one on `/selector/account`.
 */
// beforeValidate, not beforeChange: Payload lifts `password` out of `data` (into hash and salt) before beforeChange runs.
const stampPasswordChosen: CollectionBeforeValidateHook = ({ data, req }) => {
  if (!data) return data
  if (typeof data.password === 'string' && data.password && !req.context?.randomPassword) data.passwordChosenAt = new Date().toISOString()
  return data
}

/** Server-only channel for the invite token (the committee's "Add a selector" and "New invite link" endpoints). */
const applyInviteContext: CollectionBeforeChangeHook = ({ data, req }) => {
  const invite = req.context?.selectorInvite as SelectorInviteContext | undefined
  if (invite) {
    data.inviteTokenHash = invite.hash
    data.inviteExpiresAt = invite.expiresAt
    data.invitedAt = invite.invitedAt
  }
  return data
}

/** `facebookId` is only ever set on a selector row, by the OAuth flow (context flag); anyone else may only clear it. */
const facebookIdRules: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const role = (data.role ?? (originalDoc as { role?: string } | undefined)?.role) as string | undefined
  const incoming = data.facebookId
  const before = (originalDoc as { facebookId?: string | null } | undefined)?.facebookId ?? null
  // On update `data` carries the stored value too: only a different value is a change.
  if (typeof incoming === 'string' && incoming && incoming !== before) {
    if (role !== SELECTOR_ROLE) throw new APIError('A Facebook sign-in can only be linked to a selector.', 403, null, true)
    if (!req.context?.facebookBind) throw new Forbidden(req.t)
    data.facebookLinkedAt = new Date().toISOString()
  } else if (role !== SELECTOR_ROLE && before) {
    // Changing a selector into anything else drops the link.
    data.facebookId = null
  }
  if ((incoming === null || incoming === '') && before) data.facebookLinkedAt = null
  return data
}

/** A different email is a different person until proven otherwise: the Facebook link goes. (Email is never compared with Facebook.) */
const emailChangeUnlinks: CollectionBeforeChangeHook = ({ data, originalDoc, operation }) => {
  if (operation !== 'update' || typeof data.email !== 'string') return data
  const before = (originalDoc as { email?: string } | undefined)?.email
  if (before && data.email.toLowerCase() !== before.toLowerCase()) {
    data.facebookId = null
    data.facebookLinkedAt = null
  }
  return data
}

/**
 * Session revocation is a collection hook, so it also covers the raw admin form and the Local API. A password change is already
 * handled by Payload (all sessions except the current one); a role change, an email change or `disabled` going true clears every session.
 */
const revokeSessions: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req }) => {
  if (operation !== 'update' || !previousDoc) return doc
  const prev = previousDoc as { role?: string; email?: string; disabled?: boolean | null }
  const next = doc as { role?: string; email?: string; disabled?: boolean | null; id: number | string }
  const disabledNow = Boolean(next.disabled) && !prev.disabled
  if (prev.role !== next.role || prev.email !== next.email || disabledNow) {
    await req.payload.db.updateOne({ collection: 'users', id: next.id, data: { sessions: [] }, req, returning: false })
  }
  return doc
}

const stampLogin: NonNullable<NonNullable<CollectionConfig['hooks']>['afterLogin']>[number] = async ({ user, req }) => {
  await req.payload.db.updateOne({
    collection: 'users',
    id: (user as { id: number }).id,
    data: { lastLoginAt: new Date().toISOString(), lastLoginMethod: 'password' },
    req,
    returning: false,
  })
  return user
}

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'User', plural: 'Users' },
  admin: {
    useAsTitle: 'email',
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    defaultColumns: ['email', 'name', 'role'],
    description: 'People who can sign in. Editors run the day-to-day website; admins also see the advanced settings; selectors pick the teams and never see this admin. Add selectors from Advanced > Selectors.',
  },
  auth: {
    tokenExpiration: 604800,
    useSessions: true,
    // Payload's defaults, stated so a Payload default change cannot weaken the lockout.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
  },
  access: {
    // Only the committee opens the admin; a selector who signs in gets Payload's unauthorised page.
    admin: accessAdmin,
    read: ({ req }) => {
      const user = req.user
      if (isAdminUser(user)) return true
      if (isStaffUser(user)) return selfOrSelectors(user!.id)
      if (isSelectorUser(user)) return selfOnly(user!.id)
      return false
    },
    // Editors may create selectors only (forced in the hooks below), admins anyone.
    create: isStaff,
    // Editors delete selectors only; deleting any other row is admin-only.
    delete: ({ req }) => {
      const user = req.user
      if (isAdminUser(user)) return true
      if (isStaffUser(user)) return { role: { equals: SELECTOR_ROLE } }
      return false
    },
    // Payload's default is any logged-in user; an editor could clear an admin's lockout.
    unlock: ({ req }) => isAdminUser(req.user),
    update: ({ req }) => {
      const user = req.user
      if (isAdminUser(user)) return true
      if (isStaffUser(user)) return selfOrSelectors(user!.id)
      if (isSelectorUser(user)) return selfOnly(user!.id)
      return false
    },
  },
  hooks: {
    beforeOperation: [beforeOperationGuard],
    beforeValidate: [forceSelectorForEditor, passwordRules, requireCurrentPassword, stampPasswordChosen],
    beforeChange: [applyInviteContext, emailChangeUnlinks, facebookIdRules],
    afterChange: [revokeSessions],
    // One message for every refusal, so a disabled account is indistinguishable from a wrong password.
    beforeLogin: [
      ({ user, req }) => {
        if ((user as { disabled?: boolean | null }).disabled) throw new AuthenticationError(req.t)
        return user
      },
    ],
    afterLogin: [stampLogin],
    // REST login must not say which accounts exist: an unknown email, a wrong password, a disabled account and a locked account
    // all get the one message (the selector form already does).
    afterError: [
      ({ error, req }) => {
        const name = (error as { name?: string }).name
        if (req.method !== 'POST' || !req.pathname?.endsWith('/users/login')) return
        if (name !== 'AuthenticationError' && name !== 'LockedAuth') return
        return { response: { errors: [{ message: 'The email or password provided is incorrect.' }] }, status: 401 }
      },
    ],
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', admin: { description: 'Shown in the greeting, e.g. "Hello, Sam".' } },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      saveToJWT: true,
      options: [
        { label: 'Admin (looks after the site)', value: 'admin' },
        { label: 'Editor (committee member)', value: 'editor' },
        { label: 'Selector (picks the teams)', value: 'selector' },
      ],
      admin: { description: 'Editors see a short, simple menu. Admins also see the Advanced section. Selectors only use the team selection area of the website.' },
      // Editors may send `role: selector` on create (the hook forces it); they can never change a role.
      access: { update: isAdminField, create: ({ req }) => isStaffUser(req.user) },
    },
    {
      name: 'disabled',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { condition: adminOnlyCondition(), description: 'Tick to stop this person signing in. Their open sessions end straight away.' },
      access: { create: isAdminField, update: ({ req }) => isStaffUser(req.user) },
    },
    // Invite: the only authority to claim a login for the first time. Never readable over REST (hidden alone would not stop a where= probe).
    { name: 'inviteTokenHash', type: 'text', index: true, hidden: true, access: { read: nobodyField }, admin: { disableListColumn: true } },
    { name: 'inviteExpiresAt', type: 'date', hidden: true, access: { read: nobodyField }, admin: { disableListColumn: true } },
    { name: 'invitedAt', type: 'date', hidden: true, access: { read: nobodyField }, admin: { disableListColumn: true } },
    // Normal unique index: Postgres allows many NULLs, so no partial index is needed.
    { name: 'facebookId', type: 'text', unique: true, hidden: true, access: { read: nobodyField }, admin: { disableListColumn: true } },
    // When the person chose a password (null for a Facebook-invited selector who never did). Not readable over REST; only the `stampPasswordChosen` hook writes it (a non-admin's body keys are filtered in beforeOperation).
    { name: 'passwordChosenAt', type: 'date', hidden: true, access: { read: nobodyField }, admin: { disableListColumn: true } },
    { name: 'facebookLinkedAt', type: 'date', admin: { readOnly: true, condition: adminOnlyCondition(), description: 'When a Facebook sign-in was linked.' }, access: { create: nobodyField, update: nobodyField } },
    { name: 'lastLoginAt', type: 'date', admin: { readOnly: true, condition: adminOnlyCondition() }, access: { create: nobodyField, update: nobodyField } },
    {
      name: 'lastLoginMethod',
      type: 'select',
      options: [
        { label: 'Password', value: 'password' },
        { label: 'Facebook', value: 'facebook' },
      ],
      admin: { readOnly: true, condition: adminOnlyCondition() },
      access: { create: nobodyField, update: nobodyField },
    },
  ],
}
