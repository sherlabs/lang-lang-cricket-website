/** Labels for the address lines, so no regional word lives in code. Neutral defaults; the club renames them in Club office settings. */
export type AddressLabels = { addressLine: string; locality: string; region: string; postalCode: string }
export const DEFAULT_ADDRESS_LABELS: AddressLabels = { addressLine: 'Street address', locality: 'Locality', region: 'Region', postalCode: 'Postal code' }
