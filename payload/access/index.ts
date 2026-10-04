import type { Access, FieldAccess, Where } from 'payload'

/**
 * Roles and access helpers (announce-teams spec section 2). `users.role` is `admin | editor | selector`; every helper treats a
 * `disabled` user as nobody. Nothing else in the code base may ask "is there a user": that was the meaning of "staff"
 * before selectors existed, and it would hand a selector the committee's rights. `tests/staff-guard.test.ts` enforces it.
 * Collection rules protect REST and the admin only; the Local API defaults to overrideAccess.
 */
export const ROLES = ['admin', 'editor', 'selector'] as const
export type Role = (typeof ROLES)[number]

type MaybeUser = { role?: unknown; disabled?: unknown } | null | undefined

const active = (user: MaybeUser): user is NonNullable<MaybeUser> => Boolean(user) && !user!.disabled

/** admin only. */
export const isAdminUser = (user: MaybeUser): boolean => active(user) && user.role === 'admin'
/** admin or editor (the committee). */
export const isStaffUser = (user: MaybeUser): boolean => active(user) && (user.role === 'admin' || user.role === 'editor')
/** admin, editor or selector. */
export const isSelectionUser = (user: MaybeUser): boolean => isStaffUser(user) || (active(user) && user.role === 'selector')
export const isSelectorUser = (user: MaybeUser): boolean => active(user) && user.role === 'selector'

/** Only for choosing 401 (not signed in) over 403 (signed in, not allowed). Never an authorisation decision. */
export const isSignedIn = (user: unknown): boolean => Boolean(user)

export const anyone: Access = () => true
export const nobody: Access = () => false
export const isAdmin: Access = ({ req }) => isAdminUser(req.user)
/** admin | editor */
export const isStaff: Access = ({ req }) => isStaffUser(req.user)
/** admin | editor | selector */
export const isSelection: Access = ({ req }) => isSelectionUser(req.user)
export const isAdminField: FieldAccess = ({ req }) => isAdminUser(req.user)
export const isStaffField: FieldAccess = ({ req }) => isStaffUser(req.user)
export const isSelectionField: FieldAccess = ({ req }) => isSelectionUser(req.user)
export const nobodyField: FieldAccess = () => false
/** Staff see everything; everyone else (anonymous, selectors) is filtered by `where`. */
export const staffOr =
  (where: Where): Access =>
  ({ req }) =>
    isStaffUser(req.user) ? true : where
/** Selection users see everything; everyone else is filtered by `where`. */
export const selectionOr =
  (where: Where): Access =>
  ({ req }) =>
    isSelectionUser(req.user) ? true : where
