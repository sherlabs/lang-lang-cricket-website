import type { NumberField } from 'payload'

/**
 * `sortOrder` (spec §3): lower shows first. `withDefault: false` for collections using the
 * `sortFirst` hook: a default of 0 would be filled into the admin's create/bulk-upload form
 * state and submitted, so the hook could never tell "not supplied" apart.
 */
export const sortOrderField = (description = 'Lower numbers show first.', { withDefault = true } = {}): NumberField => ({
  name: 'sortOrder',
  type: 'number',
  ...(withDefault ? { defaultValue: 0 } : {}),
  index: true,
  admin: { description, step: 1 },
})
