/** Labels for the address lines, so no regional word lives in code. Neutral defaults; the club renames them in Club office settings. */
export type AddressLabels = { addressLine: string; locality: string; region: string; postalCode: string }
export const DEFAULT_ADDRESS_LABELS: AddressLabels = { addressLine: 'Street address', locality: 'Locality', region: 'Region', postalCode: 'Postal code' }

/**
 * Shift types for the volunteer roster. Generic, club-neutral defaults; a club adds its own in Club office settings. The `key` is
 * the stable identity (hours and shifts keep it for ever); the label can be renamed at any time.
 */
export type ShiftType = { key: string; label: string; defaultHours: number; defaultSlots: number; kind: 'volunteer' | 'paid' }
export const DEFAULT_SHIFT_TYPES: readonly ShiftType[] = [
  { key: 'canteen', label: 'Canteen', defaultHours: 3, defaultSlots: 2, kind: 'volunteer' },
  { key: 'bar', label: 'Bar', defaultHours: 4, defaultSlots: 2, kind: 'volunteer' },
  { key: 'gate', label: 'Gate', defaultHours: 2, defaultSlots: 1, kind: 'volunteer' },
]
