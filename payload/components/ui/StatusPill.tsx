import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'
import type { IconKey } from './icons'

export type PillTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent'

/**
 * A short status in plain words ("Showing on the website", "Hidden", "Waiting"). The words are required, so it is never colour alone;
 * `icon` adds a glyph. With a number as the child it is the count badge (pass `label` so a screen reader hears what is counted).
 */
export function StatusPill({ tone = 'neutral', icon, label, className, children }: { tone?: PillTone; icon?: IconKey; label?: string; className?: string; children: ReactNode }) {
  return (
    <span className={cx('ui-pill', `ui-pill--${tone}`, className)} aria-label={label}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  )
}
