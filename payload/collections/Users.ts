import { APIError, Forbidden, type CollectionConfig } from 'payload'
import { isAdmin, isAdminField } from '../access'
import { hiddenFromEditors } from '../admin/visibility'

/** Spec §3.1. */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'User', plural: 'Users' },
  admin: {
    useAsTitle: 'email',
    group: false,
    hideAPIURL: true,
    hidden: hiddenFromEditors,
    defaultColumns: ['email', 'name', 'role'],
    description: 'People who can sign in to this admin. Editors run the day-to-day website; admins also see the advanced settings.',
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
      ],
      admin: { description: 'Editors see a short, simple menu. Admins also see the Advanced section.' },
      access: { update: isAdminField, create: isAdminField },
    },
  ],
}
