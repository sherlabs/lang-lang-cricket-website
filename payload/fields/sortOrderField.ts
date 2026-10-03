import type { NumberField } from 'payload'

/** `sortOrder` (spec §3): lower shows first. */
export const sortOrderField = (description = 'Lower numbers show first.'): NumberField => ({
  name: 'sortOrder',
  type: 'number',
  defaultValue: 0,
  index: true,
  admin: { description, step: 1 },
})
