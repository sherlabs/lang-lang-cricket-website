import type { ReactNode } from 'react'
import { cx } from './cx'

/** A styled `<details>` for "More" and "Advanced" areas: closed by default, native keyboard behaviour, no script. */
export function Disclosure({ summary, open, className, children }: { summary: ReactNode; open?: boolean; className?: string; children: ReactNode }) {
  return (
    <details className={cx('ui-disclosure', className)} open={open || undefined}>
      <summary className="ui-disclosure__summary">{summary}</summary>
      <div className="ui-disclosure__body">{children}</div>
    </details>
  )
}
