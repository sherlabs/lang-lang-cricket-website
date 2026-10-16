import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

/** A button. `busy` sets `aria-busy` and ignores clicks while work is under way; the label stays so the width does not jump. */
export function Button({ variant = 'primary', busy = false, className, children, type = 'button', disabled, ...rest }: { variant?: ButtonVariant; busy?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cx('ui-btn', `ui-btn--${variant}`, busy && 'is-busy', className)} aria-busy={busy || undefined} disabled={disabled || busy} {...rest}>
      {children}
    </button>
  )
}

/** A link that looks like a button (navigation, not an action). */
export function LinkButton({ variant = 'primary', className, children, ...rest }: { variant?: ButtonVariant; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cx('ui-btn', `ui-btn--${variant}`, className)} {...rest}>
      {children}
    </a>
  )
}
