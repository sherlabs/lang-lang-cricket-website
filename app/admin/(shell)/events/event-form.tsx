'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createEvent, updateEvent, type EventInput } from './actions'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'
import { Field, TextInput, TextArea, FileInput } from '@/components/admin/fields'
import { Select } from '@/components/admin/select'
import { DatePicker } from '@/components/admin/date-picker'
import { TimePicker } from '@/components/admin/time-picker'
import { Button } from '@/components/ui/button'
import { useDialogClose } from '@/components/admin/action-form'
import { DAYS } from '@/lib/events-format'
import type { Event } from '@/db/schema'

function toDateStr(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

type EventType = 'one_time' | 'recurring'

const TYPE_OPTIONS = [
  { value: 'one_time', label: 'One-time event' },
  { value: 'recurring', label: 'Recurring event' },
] as const satisfies readonly { value: EventType; label: string }[]

const DAY_OPTIONS = DAYS.map((d, i) => ({ value: i, label: d }))

type Props = { event?: Event }

export function EventForm({ event }: Props) {
  const router = useRouter()
  const close = useDialogClose()
  const [type, setType] = useState<EventType>((event?.type as EventType) ?? 'one_time')
  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(event?.coverImageUrl ?? '')
  const [paymentLinkLabel, setPaymentLinkLabel] = useState(event?.paymentLinkLabel ?? '')
  const [paymentLinkUrl, setPaymentLinkUrl] = useState(event?.paymentLinkUrl ?? '')
  const [eventTime, setEventTime] = useState(event?.eventTime ?? '')
  const [eventDateStr, setEventDateStr] = useState(toDateStr(event?.eventDate ?? null))
  const [dayOfWeek, setDayOfWeek] = useState<number>(event?.dayOfWeek ?? 4)
  const [startDateStr, setStartDateStr] = useState(toDateStr(event?.startDate ?? null))
  const [endDateStr, setEndDateStr] = useState(toDateStr(event?.endDate ?? null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await optimiseImage(file, { maxEdge: 1600 })
    setCoverImageUrl(await uploadToBlob(prepared, 'events'))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const input: EventInput = {
      type,
      title,
      description,
      location,
      coverImageUrl,
      paymentLinkLabel,
      paymentLinkUrl,
      eventTime,
      eventDateStr,
      dayOfWeek: type === 'recurring' ? dayOfWeek : null,
      startDateStr,
      endDateStr,
    }
    try {
      if (event) {
        await updateEvent(event.id, input)
      } else {
        await createEvent(input)
      }
      router.refresh()
      close?.()
    } catch (err) {
      setError((err as Error).message || 'Could not save the event.')
    } finally {
      setBusy(false)
    }
  }

  const p = event ? `event-${event.id}` : 'event-new'

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Type" htmlFor={`${p}-type`}>
        <Select id={`${p}-type`} value={type} onChange={setType} options={TYPE_OPTIONS} disabled={busy} />
      </Field>
      <Field label="Title" htmlFor={`${p}-title`}>
        <TextInput id={`${p}-title`} value={title} onChange={(e) => setTitle(e.target.value)} required disabled={busy} />
      </Field>
      <Field label="Description" htmlFor={`${p}-description`} hint="Optional.">
        <TextArea id={`${p}-description`} value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} />
      </Field>
      <Field label="Location" htmlFor={`${p}-location`} hint="Optional.">
        <TextInput id={`${p}-location`} value={location} onChange={(e) => setLocation(e.target.value)} disabled={busy} />
      </Field>

      {type === 'one_time' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" htmlFor={`${p}-date`}>
            <DatePicker id={`${p}-date`} value={eventDateStr} onChange={setEventDateStr} required disabled={busy} />
          </Field>
          <Field label="Time" htmlFor={`${p}-time`} hint="Optional.">
            <TimePicker id={`${p}-time`} value={eventTime} onChange={setEventTime} disabled={busy} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Day of the week" htmlFor={`${p}-day`}>
            <Select id={`${p}-day`} value={dayOfWeek} onChange={setDayOfWeek} options={DAY_OPTIONS} disabled={busy} />
          </Field>
          <Field label="Time" htmlFor={`${p}-time`} hint="Optional.">
            <TimePicker id={`${p}-time`} value={eventTime} onChange={setEventTime} disabled={busy} />
          </Field>
          <Field label="Start date" htmlFor={`${p}-start`}>
            <DatePicker id={`${p}-start`} value={startDateStr} onChange={setStartDateStr} required disabled={busy} />
          </Field>
          <Field label="End date" htmlFor={`${p}-end`}>
            <DatePicker id={`${p}-end`} value={endDateStr} onChange={setEndDateStr} required disabled={busy} />
          </Field>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Payment link label" htmlFor={`${p}-pay-label`} hint='Optional, e.g. "Pay for food".'>
          <TextInput id={`${p}-pay-label`} value={paymentLinkLabel} onChange={(e) => setPaymentLinkLabel(e.target.value)} disabled={busy} />
        </Field>
        <Field label="Payment link URL" htmlFor={`${p}-pay-url`} hint="Optional.">
          <TextInput id={`${p}-pay-url`} type="url" value={paymentLinkUrl} onChange={(e) => setPaymentLinkUrl(e.target.value)} disabled={busy} />
        </Field>
      </div>

      <Field label="Cover image" htmlFor={`${p}-cover`} hint="Optional.">
        <FileInput id={`${p}-cover`} accept="image/*" onChange={onCoverChange} disabled={busy} />
        {coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverImageUrl} alt="" className="mt-2 aspect-video w-full max-w-sm rounded-lg object-cover" />
        )}
      </Field>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="xl" variant="brand" disabled={busy}>
          {busy ? 'Saving…' : event ? 'Save changes' : 'Add event'}
        </Button>
      </div>
    </form>
  )
}
