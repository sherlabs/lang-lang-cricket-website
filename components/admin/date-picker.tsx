'use client'

import { useEffect, useRef, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { formatLongDate } from '@/lib/events-format'
import { HiddenValueInput, PickerPopup, PickerTrigger, pickerFooterButtonClass } from './picker'

/** Calendar date as plain integers — no `Date` so no timezone can shift the day. */
type Ymd = { y: number; m: number; d: number }

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** `Fri 25 Sep 2026` — compact enough for a half-width form column; the full form goes in aria-labels. */
function formatShort(ymd: Ymd): string {
  return `${DAY_NAMES[toUtc(ymd).getUTCDay()]} ${ymd.d} ${MONTHS[ymd.m - 1].slice(0, 3)} ${ymd.y}`
}

function parseYmd(s: string): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  // Reject e.g. 2026-02-31 by round-tripping through UTC.
  const check = toUtc(ymd)
  if (check.getUTCFullYear() !== ymd.y || check.getUTCMonth() + 1 !== ymd.m || check.getUTCDate() !== ymd.d) return null
  return ymd
}

function toUtc({ y, m, d }: Ymd): Date {
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(date: Date): Ymd {
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

function formatYmd({ y, m, d }: Ymd): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function sameDay(a: Ymd | null, b: Ymd | null): boolean {
  return !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d
}

function addDays(ymd: Ymd, n: number): Ymd {
  return fromUtc(new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + n)))
}

/** Same day-of-month where possible, clamped to the target month's length. */
function addMonths(ymd: Ymd, n: number): Ymd {
  const first = new Date(Date.UTC(ymd.y, ymd.m - 1 + n, 1))
  const daysInTarget = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return { y: first.getUTCFullYear(), m: first.getUTCMonth() + 1, d: Math.min(ymd.d, daysInTarget) }
}

function today(): Ymd {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

/** Six Monday-first weeks covering the month, padded with neighbouring days. */
function monthGrid(y: number, m: number): Ymd[] {
  const firstDow = toUtc({ y, m, d: 1 }).getUTCDay() // 0 = Sunday
  const lead = (firstDow + 6) % 7 // days from the previous month to show
  const start = addDays({ y, m, d: 1 }, -lead)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

type Props = {
  id: string
  /** `"YYYY-MM-DD"` or `""` for no date. */
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
  /** Adds the value to `FormData` under this name (for uncontrolled/server-action forms). */
  name?: string
  placeholder?: string
  className?: string
  'aria-describedby'?: string
}

/**
 * Themed replacement for `<input type="date">`: a button that opens a calendar
 * popover. Controlled, with the same `"YYYY-MM-DD"` string contract as the
 * native input so form state and server actions are untouched.
 *
 * Keyboard: arrows move a day/week, PageUp/PageDown a month (Shift: a year),
 * Home/End jump to the start/end of the week, Enter/Space pick, Escape closes.
 */
export function DatePicker({ id, value, onChange, required, disabled, name, placeholder = 'Pick a date', className, ...aria }: Props) {
  const selected = parseYmd(value)
  const [open, setOpen] = useState(false)
  // The day that owns the roving tabindex; also determines the visible month.
  const [focused, setFocused] = useState<Ymd>(() => selected ?? today())
  const [view, setView] = useState<{ y: number; m: number }>(() => ({ y: focused.y, m: focused.m }))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())
  // Only move DOM focus in response to keyboard/month navigation, not on open.
  const pendingFocus = useRef(false)

  function moveFocus(next: Ymd) {
    pendingFocus.current = true
    setFocused(next)
    setView({ y: next.y, m: next.m })
  }

  useEffect(() => {
    if (!open || !pendingFocus.current) return
    pendingFocus.current = false
    cellRefs.current.get(formatYmd(focused))?.focus()
  }, [open, focused])

  function onOpenChange(next: boolean) {
    if (next) {
      const start = selected ?? today()
      setFocused(start)
      setView({ y: start.y, m: start.m })
    }
    setOpen(next)
  }

  function pick(day: Ymd) {
    onChange(formatYmd(day))
    setOpen(false)
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const jumps: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -((toUtc(focused).getUTCDay() + 6) % 7)),
      End: () => addDays(focused, 6 - ((toUtc(focused).getUTCDay() + 6) % 7)),
      PageUp: () => (e.shiftKey ? addMonths(focused, -12) : addMonths(focused, -1)),
      PageDown: () => (e.shiftKey ? addMonths(focused, 12) : addMonths(focused, 1)),
    }
    const jump = jumps[e.key]
    if (jump) {
      e.preventDefault()
      moveFocus(jump())
    }
  }

  const days = monthGrid(view.y, view.m)
  const todayYmd = today()
  const label = selected ? formatShort(selected) : null

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <div className={cn('relative', className)}>
        <PickerTrigger ref={triggerRef} id={id} icon={Calendar03Icon} label={label} placeholder={placeholder} disabled={disabled} {...aria} />
        <HiddenValueInput value={value} required={required} name={name} disabled={disabled} focusTarget={triggerRef} />
      </div>
      <PickerPopup
        initialFocus={() => cellRefs.current.get(formatYmd(focused)) ?? null}
        aria-label="Choose a date"
        className="w-[19.5rem]"
      >
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView(addMonths({ ...view, d: 1 }, -1))}
            aria-label="Previous month"
            className={cn(pickerFooterButtonClass, 'h-9 w-9 px-0')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={18} aria-hidden />
          </button>
          <div className="text-sm font-semibold" aria-live="polite">
            {MONTHS[view.m - 1]} {view.y}
          </div>
          <button
            type="button"
            onClick={() => setView(addMonths({ ...view, d: 1 }, 1))}
            aria-label="Next month"
            className={cn(pickerFooterButtonClass, 'h-9 w-9 px-0')}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} aria-hidden />
          </button>
        </div>

        <div role="grid" aria-label={`${MONTHS[view.m - 1]} ${view.y}`} onKeyDown={onGridKeyDown}>
          <div role="row" className="grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div key={w} role="columnheader" className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-brand-grey">
                {w}
              </div>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, week) => (
            <div key={week} role="row" className="grid grid-cols-7">
              {days.slice(week * 7, week * 7 + 7).map((day) => {
                const key = formatYmd(day)
                const inMonth = day.m === view.m
                const isSelected = sameDay(day, selected)
                const isToday = sameDay(day, todayYmd)
                const isFocused = sameDay(day, focused)
                return (
                  <div key={key} role="gridcell" aria-selected={isSelected} className="p-0.5">
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) cellRefs.current.set(key, el)
                        else cellRefs.current.delete(key)
                      }}
                      tabIndex={isFocused ? 0 : -1}
                      onClick={() => pick(day)}
                      onFocus={() => setFocused(day)}
                      aria-label={formatLongDate(toUtc(day), true)}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex h-9 w-full items-center justify-center rounded-md text-sm tabular-nums transition-colors',
                        'hover:bg-brand-gold-pale focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/60',
                        !inMonth && 'text-brand-grey-light',
                        isToday && !isSelected && 'font-semibold text-brand-gold-deep',
                        isSelected && 'bg-brand-black font-semibold text-white hover:bg-brand-charcoal'
                      )}
                    >
                      {day.d}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-brand-black/5 pt-2">
          <button type="button" onClick={() => pick(todayYmd)} className={pickerFooterButtonClass}>
            Today
          </button>
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
        </div>
      </PickerPopup>
    </Popover.Root>
  )
}
