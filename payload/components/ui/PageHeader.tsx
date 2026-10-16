import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * The top of every committee page: one h1 (display font), one sentence of lead, one obvious primary action, and an optional
 * "Back to ..." link. Replaces the repeated `club-page__title` / `club-page__lead` markup.
 */
export function PageHeader({ title, lead, action, back, className }: { title: ReactNode; lead?: ReactNode; action?: ReactNode; back?: { href: string; label: string }; className?: string }) {
  return (
    <header className={cx('ui-page-header', className)}>
      <div className="ui-page-header__text">
        {back ? (
          <a className="ui-page-header__back" href={back.href}>
            {back.label}
          </a>
        ) : null}
        <h1 className="admin-display ui-page-header__title">{title}</h1>
        {lead ? <p className="ui-page-header__lead">{lead}</p> : null}
      </div>
      {action ? <div className="ui-page-header__action">{action}</div> : null}
    </header>
  )
}
