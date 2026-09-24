'use client'

import { Select as SelectPrimitive } from '@base-ui/react/select'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { pickerTriggerClass } from './picker'

export type SelectOption<V extends string | number> = {
  value: V
  label: string
  disabled?: boolean
}

type Props<V extends string | number> = {
  id: string
  value: V | null
  onChange: (value: V) => void
  options: readonly SelectOption<V>[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  /** Adds the value to `FormData` under this name (for uncontrolled/server-action forms). */
  name?: string
  className?: string
  'aria-describedby'?: string
  'aria-label'?: string
}

/**
 * Themed replacement for a native `<select>`, built on Base UI's accessible
 * Select. Controlled: `value` is the selected option's value (string or
 * number), `onChange` receives the new one. Keyboard: arrows move, typing
 * jumps to a match, Enter/Space pick, Escape closes. `id` lands on the
 * trigger so a `<label htmlFor>` associates with it.
 */
export function Select<V extends string | number>({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  required,
  disabled,
  name,
  className,
  ...aria
}: Props<V>) {
  return (
    <SelectPrimitive.Root<V>
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(next)
      }}
      items={options}
      required={required}
      disabled={disabled}
      name={name}
      modal={false}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(pickerTriggerClass, 'justify-between data-[placeholder]:text-brand-grey-light', className)}
        {...aria}
      >
        <SelectPrimitive.Value placeholder={placeholder} className="truncate" />
        <SelectPrimitive.Icon className="shrink-0 text-brand-grey transition-transform data-[popup-open]:rotate-180">
          <HugeiconsIcon icon={ArrowDown01Icon} size={18} aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="z-[60] outline-none">
          <SelectPrimitive.Popup
            className={cn(
              'max-h-[var(--available-height)] min-w-[var(--anchor-width)] origin-[var(--transform-origin)] overflow-y-auto rounded-xl bg-white p-1.5 text-brand-black shadow-card-hover ring-1 ring-brand-black/10 outline-none',
              'transition-[opacity,transform] duration-150',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0'
            )}
          >
            <SelectPrimitive.List>
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={String(o.value)}
                  value={o.value}
                  disabled={o.disabled}
                  className={cn(
                    'relative flex cursor-default select-none items-center rounded-md py-2 pl-3 pr-9 text-sm outline-none transition-colors',
                    'data-[highlighted]:bg-brand-gold-pale data-[selected]:font-semibold data-[disabled]:opacity-50'
                  )}
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5 text-brand-gold-deep">
                    <HugeiconsIcon icon={Tick02Icon} size={16} aria-hidden />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
