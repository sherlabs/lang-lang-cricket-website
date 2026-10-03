import { Forbidden, type CollectionConfig } from 'payload'
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
    update: ({ req }) => (req.user?.role === 'admin' ? true : req.user ? { id: { equals: req.user.id } } : false),
  },
  hooks: {
    /**
     * First-register is closed structurally: `registerFirstUser` creates with
     * overrideAccess, so `access.create` cannot stop it. Any anonymous create
     * (first-register included) is refused unless the seed script opts in.
     */
    beforeOperation: [
      ({ operation, req, args }) => {
        if (operation === 'create' && !req.user && !req.context?.seedAdmin) {
          throw new Forbidden(req.t)
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
