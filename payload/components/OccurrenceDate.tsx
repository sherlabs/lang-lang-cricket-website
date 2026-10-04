'use client'

import type { DateFieldClientProps, DefaultCellComponentProps } from 'payload'
import { FieldDescription, FieldLabel, useField } from '@payloadcms/ui'
import { occurrenceLabel } from './rsvpSummary'

const label = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? occurrenceLabel(v) : '–')

/**
 * `event-rsvps.occurrenceDate` in the admin (spec §3.9, D12). The value is wall-clock-as-UTC and
 * stored verbatim, so it is shown read in UTC (as the public pages do) and never edited here:
 * the stock date picker works in the browser's timezone and would save a shifted instant that
 * matches no occurrence.
 */
export function OccurrenceDateField({ path, field }: DateFieldClientProps) {
  const { value } = useField<string>({ path })
  return (
    <div className="field-type read-only">
      <FieldLabel label={field.label ?? 'Occurrence'} path={path} />
      <div>{label(value)}</div>
      <FieldDescription description={field.admin?.description} path={path} />
    </div>
  )
}

export function OccurrenceDateCell({ cellData }: DefaultCellComponentProps) {
  return <span>{label(cellData)}</span>
}
