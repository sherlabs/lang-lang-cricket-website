import type { CsvCell } from '@/lib/stats/csv'
import { ROLE_LABELS, isMemberRole, displayNameFor, type NameSource } from './members'
import type { AddressLabels } from './settings-defaults'

export type ExportMember = NameSource & {
  roles?: readonly string[] | null
  status?: string | null
  email?: string | null
  phone?: string | null
  addressLine?: string | null
  locality?: string | null
  region?: string | null
  postalCode?: string | null
  membershipSince?: string | null
  lifeMemberSince?: number | null
  doNotEmail?: boolean | null
  dateOfBirth?: string | null
  emergencyContact?: { name?: string | null; phone?: string | null; relationship?: string | null } | null
  notes?: string | null
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : '')

/**
 * The members CSV. Date of birth, emergency contact and notes are left out unless `includeSensitive` (an explicit tick that the
 * audit row records). The cells are escaped by `toCsv` (formula-safe), not here.
 */
export function memberExportTable(members: readonly ExportMember[], labels: AddressLabels, includeSensitive: boolean): { header: string[]; rows: CsvCell[][] } {
  const header = ['Name', 'Roles', 'Status', 'Email', 'Phone', labels.addressLine, labels.locality, labels.region, labels.postalCode, 'Member since', 'Life member since', 'Do not email']
  if (includeSensitive) header.push('Date of birth', 'Emergency contact name', 'Emergency contact phone', 'Emergency contact relationship', 'Notes')
  const rows = members.map((m) => {
    const row: CsvCell[] = [
      displayNameFor(m),
      (m.roles ?? []).map((r) => (isMemberRole(r) ? ROLE_LABELS[r] : r)).join('; '),
      m.status === 'past' ? 'Past' : 'Active',
      m.email ?? '',
      m.phone ?? '',
      m.addressLine ?? '',
      m.locality ?? '',
      m.region ?? '',
      m.postalCode ?? '',
      day(m.membershipSince),
      m.lifeMemberSince ?? '',
      m.doNotEmail ? 'Yes' : 'No',
    ]
    if (includeSensitive) row.push(day(m.dateOfBirth), m.emergencyContact?.name ?? '', m.emergencyContact?.phone ?? '', m.emergencyContact?.relationship ?? '', m.notes ?? '')
    return row
  })
  return { header, rows }
}
