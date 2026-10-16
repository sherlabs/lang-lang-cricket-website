/**
 * The office audit log (wave D spec section 1): exports, email sends, personal-data removal and bulk member changes. A summary
 * holds keys and counts only, never a name, an address or free text. `sanitiseSummary` enforces that by construction: the caller
 * declares, for every key, either the closed list of values it may take or `number` / `boolean`; anything else is dropped.
 */
export type AuditAction = 'export' | 'email-send' | 'erase' | 'bulk-change' | 'handover'
export const AUDIT_ACTIONS: readonly AuditAction[] = ['export', 'email-send', 'erase', 'bulk-change', 'handover']

export type SummarySpec = Record<string, readonly string[] | 'number' | 'boolean'>
export type SummaryValue = string | number | boolean

export function sanitiseSummary(input: Record<string, unknown>, spec: SummarySpec): Record<string, SummaryValue> {
  const out: Record<string, SummaryValue> = {}
  for (const [key, rule] of Object.entries(spec)) {
    const v = input[key]
    if (rule === 'number') {
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    } else if (rule === 'boolean') {
      if (typeof v === 'boolean') out[key] = v
    } else if (typeof v === 'string' && rule.includes(v)) {
      out[key] = v
    }
  }
  return out
}

export type AuditEntry = {
  userId: number
  action: AuditAction
  module: string
  summary: Record<string, SummaryValue>
  rowCount: number
  includedSensitive: boolean
}
