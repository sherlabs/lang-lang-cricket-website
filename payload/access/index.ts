import type { Access, FieldAccess, Where } from 'payload'

/** Spec §2. Collection rules protect REST and the admin only; the Local API defaults to overrideAccess. */
export const anyone: Access = () => true
export const nobody: Access = () => false
export const isAdmin: Access = ({ req }) => req.user?.role === 'admin'
/** admin | editor */
export const isStaff: Access = ({ req }) => Boolean(req.user)
export const isAdminField: FieldAccess = ({ req }) => req.user?.role === 'admin'
export const isStaffField: FieldAccess = ({ req }) => Boolean(req.user)
export const nobodyField: FieldAccess = () => false
/** Staff see everything; anonymous reads are filtered by `where`. */
export const staffOr =
  (where: Where): Access =>
  ({ req }) =>
    req.user ? true : where
