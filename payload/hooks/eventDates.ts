import { ValidationError, type CollectionBeforeValidateHook, type ValidationFieldError } from 'payload'
import { CLUB_TIMEZONE } from '../../config/site'

type DateInput = string | Date | null | undefined

const toDate = (v: DateInput): Date | null => {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Snap a picked date to UTC midnight of its calendar day in the club's timezone (spec D12,
 * §3.8). Event dates keep the legacy wall-clock-as-UTC encoding: the *day* is what matters,
 * stored as `Date.UTC(y, m, d)`.
 * - A value already exactly at `00:00:00.000Z` is kept (idempotent; ETL'd legacy dates).
 * - Otherwise the instant's calendar day in `timeZone` wins, so the result is right whether
 *   the admin picker sent local midnight, local noon, or anything else on that local day.
 * Returns an ISO string, or null for an empty/invalid value.
 */
export function snapToClubDay(value: DateInput, timeZone = CLUB_TIMEZONE): string | null {
  const d = toDate(value)
  if (!d) return null
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return d.toISOString()
  }
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day'))).toISOString()
}

/**
 * `beforeValidate` on events (spec §3.8, `eventDates.ts`):
 * - one_time: `eventDate` required; `dayOfWeek`, `startDate`, `endDate` nulled.
 * - recurring: `dayOfWeek`, `startDate`, `endDate` required, `startDate <= endDate`; `eventDate` nulled.
 * - the dates are snapped with `snapToClubDay`.
 * Evaluated against `{ ...originalDoc, ...data }` so a partial PATCH is checked as a whole,
 * and the results are written back into `data`. Skipped entirely under `context.etl`.
 */
export const eventDates: CollectionBeforeValidateHook = ({ data, originalDoc, req, collection }) => {
  if (!data || req.context?.etl) return data
  const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
  const type = merged.type === 'recurring' ? 'recurring' : 'one_time'
  const errors: ValidationFieldError[] = []

  if (type === 'one_time') {
    const eventDate = snapToClubDay(merged.eventDate as DateInput)
    if (!eventDate) errors.push({ path: 'eventDate', message: 'Date is required.' })
    data.eventDate = eventDate
    data.dayOfWeek = null
    data.startDate = null
    data.endDate = null
  } else {
    const startDate = snapToClubDay(merged.startDate as DateInput)
    const endDate = snapToClubDay(merged.endDate as DateInput)
    const day = merged.dayOfWeek
    if (day === null || day === undefined || day === '') errors.push({ path: 'dayOfWeek', message: 'Day of the week is required.' })
    if (!startDate) errors.push({ path: 'startDate', message: 'Start date is required.' })
    if (!endDate) errors.push({ path: 'endDate', message: 'End date is required.' })
    if (startDate && endDate && startDate > endDate) errors.push({ path: 'endDate', message: 'End date must be on or after the start date.' })
    data.startDate = startDate
    data.endDate = endDate
    data.eventDate = null
  }

  if (errors.length) throw new ValidationError({ collection: collection.slug, errors, req })
  return data
}
