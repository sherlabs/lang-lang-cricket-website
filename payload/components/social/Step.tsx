'use client'

import type { ReactNode } from 'react'
import { Icon } from '../ui'

/**
 * One numbered, collapsible step of the composer (wave G WP-2a). When it is collapsed it shows what was chosen, so progress stays
 * visible and a person can see where they are without opening anything. The header is a real button (`aria-expanded`).
 */
export function Step({ n, title, summary, open, onToggle, id, children }: { n: number; title: string; summary?: ReactNode; open: boolean; onToggle: () => void; id: string; children: ReactNode }) {
  return (
    <section className={`social-step${open ? ' is-open' : ''}`} aria-labelledby={`${id}-h`}>
      <h2 className="social-step__head" id={`${id}-h`}>
        <button type="button" className="social-step__button" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
          <span className="social-step__num" aria-hidden="true">{n}</span>
          <span className="social-step__title">{title}</span>
          {!open && summary ? <span className="social-step__summary">{summary}</span> : null}
          <Icon name="chevron-down" size={18} className="social-step__chev" />
        </button>
      </h2>
      <div className="social-step__body" id={`${id}-body`} hidden={!open}>{children}</div>
    </section>
  )
}
