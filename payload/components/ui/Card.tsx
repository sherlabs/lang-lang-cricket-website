import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

/** A white surface with a hairline border. `raised` adds the one card shadow, `tint` is the highlighted (selected, callout) look. */
export function Card({ as, tone = 'plain', className, children, ...rest }: { as?: ElementType; tone?: 'plain' | 'raised' | 'tint'; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  const Tag = as ?? 'div'
  return (
    <Tag className={cx('ui-card', tone !== 'plain' && `ui-card--${tone}`, className)} {...rest}>
      {children}
    </Tag>
  )
}

/** A titled block of a page: a section heading with an optional action on the right, then its content. */
export function Section({ title, action, id, level = 2, children, className }: { title: ReactNode; action?: ReactNode; id?: string; level?: 2 | 3; children: ReactNode; className?: string }) {
  const Heading = level === 2 ? 'h2' : 'h3'
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} aria-labelledby={headingId} className={cx('ui-section', className)}>
      <div className="ui-section__head">
        <Heading id={headingId} className="ui-section__title">
          {title}
        </Heading>
        {action ? <div className="ui-section__action">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
