import { HugeiconsIcon } from '@hugeicons/react'
import { cx } from './cx'
import { ICONS, type IconKey } from './icons'

/** A decorative icon from the registry (`icons.ts`). Always hidden from assistive tech: the text next to it names the thing. */
export function Icon({ name, size = 20, className }: { name: IconKey; size?: number; className?: string }) {
  return <HugeiconsIcon icon={ICONS[name]} size={size} className={cx('ui-icon', className)} aria-hidden="true" />
}
