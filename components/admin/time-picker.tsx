'use client'

import { useEffect, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Clock01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { formatLocalTime } from '@/lib/playhq/format'
import { HiddenValueInput, PickerPopup, PickerTrigger, pickerFooterButtonClass } from './picker'

type Period = 'am' | 'pm'
type Parsed = { hour12: number; minute: number; period: Period }

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const PERIODS: Period[] = ['am', 'pm']

/** Accepts `"HH:mm"` or `"HH:mm:ss"` (the DB stores both); anything else is "no time". */
function parseTime(s: string): Parsed | null {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const minute = Number(m[2])
  if (h > 23 || minute > 59) return null
  return { hour12: h % 12 === 0 ? 12 : h % 12, minute, period: h >= 12 ? 'pm' : 'am' }
}

function toHHmm({ hour12, minute, period }: Parsed): string {
  const h = (hour12 % 12) + (period === 'pm' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

type Props = {
  id: string
  /** `"HH:mm"` (24-hour) or `""` for no time. */
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  name?: string
  placeholder?: string
  /** Minute granularity shown in the picker. An existing value off the grid is still listed. */
  minuteStep?: number
  className?: string
  'aria-describedby'?: string
}

/**
 * Themed replacement for `<input type="time">`: a button that opens hour /
 * minute / am-pm columns. Controlled, emitting `"HH:mm"` like the native input.
 * Each column is a listbox: arrows move, Enter/Space pick, Tab moves to the
 * next column, Escape closes. Picks apply immediately so any order works.
 */
export function TimePicker({
  id,
  value,
  onChange,
  required,
  disabled,
  name,
  placeholder = 'Pick a time',
  minuteStep = 5,
  className,
  ...aria
}: Props) {
  const parsed = parseTime(value)
  const [open, setOpen] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)
  if (parsed && !minutes.includes(parsed.minute)) minutes.push(parsed.minute)
  minutes.sort((a, b) => a - b)

  // Bring the selected options into view once the popup is open.
  useEffect(() => {
    if (!open) return
    popupRef.current?.querySelectorAll<HTMLElement>('[aria-selected="true"]').forEach((el) => el.scrollIntoView({ block: 'center' }))
  }, [open])

  function update(patch: Partial<Parsed>) {
    onChange(toHHmm({ hour12: 12, minute: 0, period: 'am', ...parsed, ...patch }))
  }

  const label = parsed ? formatLocalTime(toHHmm(parsed)) : null

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <PickerTrigger ref={triggerRef} id={id} icon={Clock01Icon} label={label} placeholder={placeholder} disabled={disabled} {...aria} />
        <HiddenValueInput value={value} required={required} name={name} disabled={disabled} focusTarget={triggerRef} />
      </div>
      <PickerPopup
        ref={popupRef}
        // Land on the hour column's tab stop: the selected hour, or 12 when empty.
        initialFocus={() => popupRef.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]') ?? null}
        aria-label="Choose a time"
        className="w-[15rem]"
      >
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Column
            label="Hour"
            options={HOURS.map((h) => ({ value: h, label: String(h) }))}
            selected={parsed?.hour12 ?? null}
            onPick={(hour12) => update({ hour12 })}
          />
          <Column
            label="Minute"
            options={minutes.map((m) => ({ value: m, label: String(m).padStart(2, '0') }))}
            selected={parsed?.minute ?? null}
            onPick={(minute) => update({ minute })}
          />
          <Column
            label="Period"
            options={PERIODS.map((p) => ({ value: p, label: p.toUpperCase() }))}
            selected={parsed?.period ?? null}
            onPick={(period) => update({ period })}
            scroll={false}
          />
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-brand-black/5 pt-2">
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            disabled={!value}
            className={cn(pickerFooterButtonClass, 'text-brand-grey')}
          >
            Clear
          </button>
          <button type="button" onClick={() => setOpen(false)} className={pickerFooterButtonClass}>
            Done
          </button>
        </div>
      </PickerPopup>
    </Popover.Root>
  )
}

type ColumnProps<V extends string | number> = {
  label: string
  options: { value: V; label: string }[]
  selected: V | null
  onPick: (value: V) => void
  scroll?: boolean
}

/** One listbox column with roving tabindex; the selected (or first) option is the tab stop. */
function Column<V extends string | number>({ label, options, selected, onPick, scroll = true }: ColumnProps<V>) {
  const [focusIndex, setFocusIndex] = useState<number | null>(null)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIndex = options.findIndex((o) => o.value === selected)
  const tabStop = focusIndex ?? (selectedIndex === -1 ? 0 : selectedIndex)

  function onKeyDown(e: React.KeyboardEvent) {
    const current = focusIndex ?? tabStop
    const moves: Record<string, number> = {
      ArrowDown: Math.min(options.length - 1, current + 1),
      ArrowUp: Math.max(0, current - 1),
      Home: 0,
      End: options.length - 1,
    }
    const next = moves[e.key]
    if (next === undefined) return
    e.preventDefault()
    setFocusIndex(next)
    refs.current[next]?.focus()
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-brand-grey">{label}</div>
      <div
        role="listbox"
        aria-label={label}
        onKeyDown={onKeyDown}
        className={cn('flex flex-col gap-0.5 pr-0.5', scroll && 'h-52 overflow-y-auto')}
      >
        {options.map((o, i) => {
          const isSelected = o.value === selected
          return (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={isSelected}
              tabIndex={i === tabStop ? 0 : -1}
              ref={(el) => {
                refs.current[i] = el
              }}
              onFocus={() => setFocusIndex(i)}
              onClick={() => onPick(o.value)}
              className={cn(
                'flex h-9 shrink-0 items-center justify-center rounded-md px-2 text-sm tabular-nums transition-colors',
                'hover:bg-brand-gold-pale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/60',
                isSelected && 'bg-brand-black font-semibold text-white hover:bg-brand-charcoal'
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
