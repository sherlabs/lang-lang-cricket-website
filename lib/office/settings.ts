import { OFFICE_CURRENCY, OFFICE_LOCALE } from '@/config/site'

import { DEFAULT_ADDRESS_LABELS, type AddressLabels } from './settings-defaults'

export { DEFAULT_ADDRESS_LABELS, type AddressLabels }

export type OfficeSettings = { currency: string; locale: string; addressLabels: AddressLabels }

const text = (v: unknown, max = 60): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** The settings global with every gap filled. Pure: the loader passes the raw document (or null). */
export function resolveOfficeSettings(doc: unknown): OfficeSettings {
  const d = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>
  const labels = (d.addressLabels && typeof d.addressLabels === 'object' ? d.addressLabels : {}) as Record<string, unknown>
  return {
    currency: text(d.currency, 3)?.toUpperCase() ?? OFFICE_CURRENCY,
    locale: text(d.locale, 20) ?? OFFICE_LOCALE,
    addressLabels: {
      addressLine: text(labels.addressLine) ?? DEFAULT_ADDRESS_LABELS.addressLine,
      locality: text(labels.locality) ?? DEFAULT_ADDRESS_LABELS.locality,
      region: text(labels.region) ?? DEFAULT_ADDRESS_LABELS.region,
      postalCode: text(labels.postalCode) ?? DEFAULT_ADDRESS_LABELS.postalCode,
    },
  }
}
