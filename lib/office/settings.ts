import { OFFICE_CURRENCY, OFFICE_LOCALE } from '@/config/site'

import { DEFAULT_ADDRESS_LABELS, DEFAULT_SHIFT_TYPES, type AddressLabels, type ShiftType } from './settings-defaults'
import { isHoursKind, isShiftKey } from './volunteers'

export { DEFAULT_ADDRESS_LABELS, DEFAULT_SHIFT_TYPES, type AddressLabels, type ShiftType }

export type OfficeSettings = { currency: string; locale: string; chargeFillIns: boolean; addressLabels: AddressLabels; shiftTypes: ShiftType[] }

const text = (v: unknown, max = 60): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

/** Shift types as saved, keeping only well-formed rows; an empty or missing list means the neutral defaults. */
function resolveShiftTypes(raw: unknown): ShiftType[] {
  const out: ShiftType[] = []
  for (const r of Array.isArray(raw) ? raw : []) {
    const t = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    const hours = Number(t.defaultHours)
    const slots = Number(t.defaultSlots)
    if (!isShiftKey(t.key) || out.some((o) => o.key === t.key)) continue
    out.push({
      key: t.key,
      label: text(t.label, 60) ?? t.key,
      defaultHours: Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : 2,
      defaultSlots: Number.isInteger(slots) && slots >= 1 && slots <= 50 ? slots : 1,
      kind: isHoursKind(t.kind) ? t.kind : 'volunteer',
    })
  }
  return out.length ? out : DEFAULT_SHIFT_TYPES.map((t) => ({ ...t }))
}

/** The settings global with every gap filled. Pure: the loader passes the raw document (or null). */
export function resolveOfficeSettings(doc: unknown): OfficeSettings {
  const d = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>
  const labels = (d.addressLabels && typeof d.addressLabels === 'object' ? d.addressLabels : {}) as Record<string, unknown>
  return {
    currency: text(d.currency, 3)?.toUpperCase() ?? OFFICE_CURRENCY,
    locale: text(d.locale, 20) ?? OFFICE_LOCALE,
    chargeFillIns: d.chargeFillIns === true,
    addressLabels: {
      addressLine: text(labels.addressLine) ?? DEFAULT_ADDRESS_LABELS.addressLine,
      locality: text(labels.locality) ?? DEFAULT_ADDRESS_LABELS.locality,
      region: text(labels.region) ?? DEFAULT_ADDRESS_LABELS.region,
      postalCode: text(labels.postalCode) ?? DEFAULT_ADDRESS_LABELS.postalCode,
    },
    shiftTypes: resolveShiftTypes(d.shiftTypes),
  }
}
