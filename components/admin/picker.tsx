'use client'

import { forwardRef } from 'react'
import { Popover } from '@base-ui/react/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for the popover-style admin pickers (date, time).
 * Styling here is Tailwind 3 syntax — `data-[open]:`, `ring-2` — because the
 * project is on Tailwind 3.4, not 4.
 */

/** Trigger button styled like `TextInput`, plus open/focus states in brand gold. */
export const pickerTriggerClass = cn(
  'flex h-11 w-full items-center gap-2 rounded-lg border border-brand-black/15 bg-white px-3 text-left text-base text-brand-black transition-colors md:text-sm',
  'hover:border-brand-black/30',
  'focus-visible:border-brand-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/40',
  'data-[popup-open]:border-brand-gold data-[popup-open]:ring-2 data-[popup-open]:ring-brand-gold/40',
  'disabled:cursor-not-allowed disabled:opacity-50'
)

/** Popup surface: matches the admin `Dialog` card treatment at dropdown scale. */
export const pickerPopupClass = cn(
  'origin-[var(--transform-origin)] rounded-xl bg-white p-3 text-brand-black shadow-card-hover ring-1 ring-brand-black/10 outline-none',
  'transition-[opacity,transform] duration-150',
  'data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'
)

/** Small footer action inside a picker popup ("Today", "Clear", "Done"). */
export const pickerFooterButtonClass = cn(
  'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-brand-black transition-colors',
  'hover:bg-brand-stone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/40',
  'disabled:cursor-not-allowed disabled:opacity-50'
)

type TriggerProps = Omit<Popover.Trigger.Props, 'className' | 'children'> & {
  icon: IconSvgElement
  /** Text to show; `null` renders the placeholder in muted grey. */
  label: string | null
  placeholder: string
  className?: string
}

/** Input-shaped popover trigger with a leading icon and a text label or placeholder. */
export const PickerTrigger = forwardRef<HTMLButtonElement, TriggerProps>(function PickerTrigger(
  { icon, label, placeholder, className, ...props },
  ref
) {
  return (
    <Popover.Trigger ref={ref} className={cn(pickerTriggerClass, className)} {...props}>
      <HugeiconsIcon icon={icon} size={18} className="shrink-0 text-brand-grey" aria-hidden />
      {label ? <span className="truncate">{label}</span> : <span className="truncate text-brand-grey-light">{placeholder}</span>}
    </Popover.Trigger>
  )
})

type PopupProps = Popover.Popup.Props & {
  align?: Popover.Positioner.Props['align']
}

/** Portal + positioner + popup, sitting above the z-50 admin dialogs. */
export const PickerPopup = forwardRef<HTMLDivElement, PopupProps>(function PickerPopup({ className, align = 'start', ...props }, ref) {
  return (
    <Popover.Portal>
      <Popover.Positioner sideOffset={6} align={align} className="z-[60] outline-none">
        <Popover.Popup ref={ref} className={cn(pickerPopupClass, className)} {...props} />
      </Popover.Positioner>
    </Popover.Portal>
  )
})

/**
 * Invisible input that carries the picker's value into native form validation
 * (`required`) and `FormData` (`name`). It sits over the trigger so the browser's
 * "Please fill in this field" bubble points at the control, and it is never in
 * the tab order. When the browser focuses it (failed validation), focus is
 * forwarded to the trigger, the same way Base UI's Select handles its hidden input.
 */
export function HiddenValueInput({
  value,
  focusTarget,
  ...props
}: Omit<React.ComponentProps<'input'>, 'value'> & { value: string; focusTarget: React.RefObject<HTMLElement | null> }) {
  return (
    <input
      tabIndex={-1}
      aria-hidden
      value={value}
      onChange={() => {}}
      onFocus={() => focusTarget.current?.focus({ focusVisible: true } as FocusOptions)}
      className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      {...props}
    />
  )
}
