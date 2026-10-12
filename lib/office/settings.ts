import { OFFICE_CURRENCY, OFFICE_LOCALE } from '@/config/site'

import { DEFAULT_ADDRESS_LABELS, DEFAULT_ANNUAL_MEETING_NAME, DEFAULT_EMAIL_FOOTER, DEFAULT_RECIPIENT_RETENTION_DAYS, DEFAULT_SHIFT_TYPES, DEFAULT_UNSUBSCRIBE_TEXT, MAX_RECIPIENT_RETENTION_DAYS, type AddressLabels, type ShiftType } from './settings-defaults'
import { DEFAULT_CATEGORY_LABELS, DEFAULT_DIARY_LEAD_DAYS, DIARY_CATEGORIES, MAX_DIARY_LEAD_DAYS, type DiaryCategory } from './diary'
import { isHoursKind, isShiftKey } from './volunteers'

export { DEFAULT_ADDRESS_LABELS, DEFAULT_SHIFT_TYPES, type AddressLabels, type ShiftType }

export type OfficeSettings = { currency: string; locale: string; chargeFillIns: boolean; addressLabels: AddressLabels; shiftTypes: ShiftType[]; annualMeetingName: string; diaryLeadDays: number; diaryCategoryLabels: Record<DiaryCategory, string>; email: EmailSettings }

export type EmailSettings = { footer: string; unsubscribeText: string; complianceText: string; retentionDays: number }

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
    annualMeetingName: text(d.annualMeetingName, 60) ?? DEFAULT_ANNUAL_MEETING_NAME,
    diaryLeadDays: Number.isInteger(Number(d.diaryLeadDays)) && Number(d.diaryLeadDays) >= 1 && Number(d.diaryLeadDays) <= MAX_DIARY_LEAD_DAYS ? Number(d.diaryLeadDays) : DEFAULT_DIARY_LEAD_DAYS,
    email: {
      footer: text(d.emailFooter, 400) ?? DEFAULT_EMAIL_FOOTER,
      unsubscribeText: text(d.unsubscribeText, 300) ?? DEFAULT_UNSUBSCRIBE_TEXT,
      complianceText: text(d.complianceText, 600) ?? '',
      retentionDays: Number.isInteger(Number(d.recipientRetentionDays)) && Number(d.recipientRetentionDays) >= 1 && Number(d.recipientRetentionDays) <= MAX_RECIPIENT_RETENTION_DAYS ? Number(d.recipientRetentionDays) : DEFAULT_RECIPIENT_RETENTION_DAYS,
    },
    diaryCategoryLabels: Object.fromEntries(DIARY_CATEGORIES.map((k) => [k, text((d.diaryCategoryLabels as Record<string, unknown> | undefined)?.[k], 40) ?? DEFAULT_CATEGORY_LABELS[k]])) as Record<DiaryCategory, string>,
  }
}
