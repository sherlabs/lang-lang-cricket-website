import type { CsvCell } from '@/lib/stats/csv'
import { feeReport, ledgerFor, type FeeModel } from './fee-report'
import { STATUS_LABEL } from './fees'
import type { OfficeSettings } from './settings'

const amount = (cents: number): string => (cents / 100).toFixed(2)

/**
 * The fees CSV: one row per member for the season, and with the detail tick a second block with one row per charge. Amounts are
 * plain decimals in the club currency (named in the header). The cells are escaped by `toCsv`, not here.
 */
export function buildFeeExport(model: FeeModel, season: string, detail: boolean, settings: Pick<OfficeSettings, 'currency'>): { header: string[]; rows: CsvCell[][] } {
  const cur = settings.currency
  const report = feeReport(model, season)
  const header = ['Name', 'Household', 'Membership type', `Payable (${cur})`, `Paid, all payments to date (${cur})`, `Paid specifically for this season (${cur})`, `Waived (${cur})`, `Owing (${cur})`, `Credit held (${cur})`, 'Season status']
  const hhName = new Map<number, string>(report.households.map((h) => [h.key, h.names.join(' and ')]))
  const rows: CsvCell[][] = report.rows.map((r) => [r.name, hhName.get(r.householdKey) ?? r.name, r.tier, amount(r.payableCents), amount(r.paidCents), amount(r.paidSpecificCents), amount(r.waivedCents), amount(r.owedCents), amount(r.creditCents), report.closed ? 'Closed' : 'Open'])
  if (detail) {
    const pad = (cells: CsvCell[]): CsvCell[] => [...cells, ...Array<CsvCell>(Math.max(0, header.length - cells.length)).fill('')]
    rows.push(pad([]), pad(['Detail by charge']), pad(['Name', 'Date', 'Description', 'Status', `Payable (${cur})`, `Paid (${cur})`, `Waived (${cur})`, `Owing (${cur})`]))
    for (const r of report.rows) {
      for (const l of ledgerFor(model, r.memberId).lines) {
        if (l.season !== season) continue
        rows.push(pad([r.name, l.date, l.description, STATUS_LABEL[l.status], amount(l.payableCents), amount(l.paidCents), amount(l.waivedCents), amount(l.owedCents)]))
      }
    }
  }
  return { header, rows }
}
