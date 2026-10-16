'use client'

import { useEffect, useState } from 'react'
import { btnQuiet } from '@/components/selector/styles'

/**
 * Two-tap guard for an action that cannot be undone. The first tap swaps the button for "Really ...?" plus Cancel; the second tap
 * runs `onConfirm`, or submits the surrounding form when there is none. It disarms by itself after a few seconds.
 */
export function ConfirmButton({ label, confirmLabel, className, confirmClassName, onConfirm, disabled }: { label: string; confirmLabel: string; className: string; confirmClassName?: string; onConfirm?: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 6000)
    return () => clearTimeout(t)
  }, [armed])
  if (!armed) return <button type="button" className={className} disabled={disabled} onClick={() => setArmed(true)}>{label}</button>
  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Confirm">
      <button type={onConfirm ? 'button' : 'submit'} className={confirmClassName ?? className} disabled={disabled} onClick={onConfirm ? () => { setArmed(false); onConfirm() } : undefined} autoFocus>{confirmLabel}</button>
      <button type="button" className={btnQuiet} onClick={() => setArmed(false)}>Cancel</button>
    </span>
  )
}
