import { APIError, Forbidden, type CollectionConfig } from 'payload'
import { isAdmin, isAdminField } from '../access'

/** Spec §3.1. */
export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Settings',
    defaultColumns: ['email', 'name', 'role'],
  },
  auth: {
    tokenExpiration: 604800,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
  },
  access: {
    read: ({ req }) => (req.user?.role === 'admin' ? true : req.user ? { id: { equals: req.user.id } } : false),
    create: isAdmin,
    delete: isAdmin,
    // Payload's default is any logged-in user; an editor could clear an admin's lockout (§3.1).
    unlock: isAdmin,
    update: ({ req }) => (req.user?.role === 'admin' ? true : req.user ? { id: { equals: req.user.id } } : false),
  },
  hooks: {
    /**
     * First-register is closed structurally: `registerFirstUser` creates with
     * overrideAccess, so `access.create` cannot stop it. Any anonymous create
     * (first-register included) is refused unless the seed script opts in.
     *
     * Forgot-password is disabled: there is no email adapter, so Payload would write the
     * reset link and token to the server logs. An admin sets a new password instead (§3.1).
     */
    beforeOperation: [
      ({ operation, req, args }) => {
        if (operation === 'create' && !req.user && !req.context?.seedAdmin) {
          throw new Forbidden(req.t)
        }
        if (operation === 'forgotPassword') {
          throw new APIError('Password reset by email is not available. Ask an admin to set a new password.', 403, null, true)
        }
        return args
      },
    ],
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      saveToJWT: true,
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
      ],
      access: { update: isAdminField, create: isAdminField },
    },
  ],
}
