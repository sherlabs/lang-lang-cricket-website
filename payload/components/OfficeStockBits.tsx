// @committee-facing
import { randomUUID } from 'node:crypto'
import { ISSUE_STATUS_LABEL, STOCK_ERROR_TEXT, STOCK_NOTICE_TEXT, isStockError, isStockNotice, type IssueStatus } from '@/lib/office/stock'

export const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** The saved / refused message after a form posts back. The address carries a short code, never text. */
export function StockFlash({ notice, error, n }: { notice: string; error: string; n?: string }) {
  return (
    <div role="status" aria-live="polite">
      {isStockNotice(notice) ? <p className="office-flash office-flash--ok">{STOCK_NOTICE_TEXT[notice]}{n ? ` (${n} ${n === '1' ? 'item' : 'items'})` : ''}</p> : null}
      {isStockError(error) ? <p className="office-flash office-flash--error">{STOCK_ERROR_TEXT[error]}</p> : null}
    </div>
  )
}

/** A one-shot key made when the form is drawn: a second post with the same key (a double tap) records nothing more. */
export function Nonce() {
  return <input type="hidden" name="nonce" value={randomUUID()} />
}

/** Status in words, with a mark, never by colour alone. */
export function StatusBadge({ status, overdue, days }: { status: IssueStatus; overdue?: boolean; days?: number }) {
  return (
    <span className="ui-pill ui-pill--neutral">
      {overdue ? `⚠ Overdue${days ? ` by ${days} ${days === 1 ? 'day' : 'days'}` : ''}. ` : ''}
      {ISSUE_STATUS_LABEL[status]}
    </span>
  )
}

export function LowBadge({ onHand }: { onHand: number }) {
  return <span className="ui-pill ui-pill--neutral">{'⚠'} Low{onHand < 0 ? ' (count is below zero, do a stocktake)' : ''}</span>
}
