import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'
import type { IconKey } from './icons'

/** "Nothing here yet": an icon, one sentence, and (where there is something to do) one action. */
export function EmptyState({ icon = 'pages', action, className, children }: { icon?: IconKey; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cx('ui-empty', className)}>
      <Icon name={icon} size={28} className="ui-empty__icon" />
      <p className="ui-empty__text">{children}</p>
      {action ? <div className="ui-empty__action">{action}</div> : null}
    </div>
  )
}
