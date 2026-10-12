import type { Access, FieldAccess } from 'payload'
import { isOfficeBearer } from '../../lib/office/office-bearer'
import { isStaffUser } from './index'

/**
 * Access for committee meetings and office-bearer documents (wave D spec 6.2). Staff (admin or editor) read unrestricted rows;
 * restricted rows and the documents are for office-bearers only (`lib/office/office-bearer.ts`). Async, fails closed.
 */
export const staffReadsMeetingData: Access = async ({ req }) => {
  if (!isStaffUser(req.user)) return false
  if (await isOfficeBearer(req.user, req)) return true
  return { restricted: { equals: false } }
}

/** Same rule for children, which carry a server-maintained copy of their effective restriction. */
export const staffReadsMeetingChild: Access = async ({ req }) => {
  if (!isStaffUser(req.user)) return false
  if (await isOfficeBearer(req.user, req)) return true
  return { effectiveRestricted: { equals: false } }
}

export const bearerOnly: Access = async ({ req }) => isStaffUser(req.user) && (await isOfficeBearer(req.user, req))
export const bearerOnlyField: FieldAccess = async ({ req }) => isStaffUser(req.user) && (await isOfficeBearer(req.user, req))
