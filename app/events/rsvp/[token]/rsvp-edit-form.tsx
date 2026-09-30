'use client'

import Link from 'next/link'
import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle01Icon } from '@hugeicons/core-free-icons'
import { Button, buttonVariants } from '@/components/ui/button'
import { ChoiceGroup } from '@/components/events/choice-group'
import type { RsvpResponse } from '@/lib/rsvp-response'
import { cancelRsvpByToken, updateRsvpByToken } from './actions'

type Props = {
  token: string
  initialName: string
  initialEmail: string
  initialNote: string
  initialResponse: RsvpResponse
  /** Stored dinner choice ('' = no dinner). */
  initialMeal: string
  /** The event's current dinner options; [] when none or the event is gone. */
  mealOptions: string[]
  /** Null when the event has since been deleted — the cancelled copy then leans on the date alone. */
  eventTitle: string | null
  /** Already-formatted (UTC-anchored, server-side) date label for the confirmation copy. */
  occurrenceLabel: string
}

// Same field styling as app/events/[id]/rsvp/rsvp-form.tsx so the two RSVP pages read as one flow.
const inputClass =
  'mt-2 h-12 w-full rounded-xl border border-brand-black/10 bg-white px-4 text-base text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold'

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-brand-black">{label}</span>
      {hint && <span className="ml-1.5 text-xs font-normal text-brand-grey">{hint}</span>}
      {children}
    </label>
  )
}

export function RsvpEditForm({
  token,
  initialName,
  initialEmail,
  initialNote,
  initialResponse,
  initialMeal,
  mealOptions,
  eventTitle,
  occurrenceLabel,
}: Props) {
  const [response, setResponse] = useState<RsvpResponse>(initialResponse)
  const [dinner, setDinner] = useState<'yes' | 'no' | ''>(mealOptions.length ? (initialMeal ? 'yes' : 'no') : '')
  const [meal, setMeal] = useState(initialMeal)
  const hasDinner = response === 'yes' && mealOptions.length > 0
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelled, setCancelled] = useState(false)

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    setSaved(false)
    const result = await updateRsvpByToken(token, formData)
    setBusy(false)
    if (result?.error) {
      setError(result.error)
    } else {
      setSaved(true)
    }
  }

  async function onCancelConfirmed() {
    setBusy(true)
    setCancelError(null)
    const result = await cancelRsvpByToken(token)
    setBusy(false)
    if (result?.error) {
      setCancelError(result.error)
    } else {
      setCancelled(true)
    }
  }

  if (cancelled) {
    return (
      <div className="self-start rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-stone text-brand-grey ring-1 ring-brand-black/10">
          <HugeiconsIcon icon={CheckmarkCircle01Icon} className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="display mt-5 text-3xl text-brand-black sm:text-4xl">Your RSVP has been cancelled.</h2>
        <p className="mt-3 text-base leading-relaxed text-brand-grey">
          We&apos;ve taken you off the list for{' '}
          {eventTitle && (
            <>
              <span className="font-semibold text-brand-black">{eventTitle}</span> on{' '}
            </>
          )}
          <span className="font-semibold text-brand-black">{occurrenceLabel}</span>. Sorry you can&apos;t make it — we
          hope to see you at the next one.
        </p>
        <p className="mt-3 text-sm text-brand-grey-light">
          This link won&apos;t work any more. If you change your mind, just RSVP again from the events page.
        </p>
        <div className="mt-6">
          <Link href="/events" className={buttonVariants({ variant: 'brand', size: 'xl' })}>
            Back to events
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <form action={onSubmit} className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-brand-black/5 sm:p-8">
        <h2 className="display text-2xl text-brand-black">Your details</h2>
        <p className="mt-1.5 text-sm text-brand-grey">We only use these to plan numbers — nothing is published.</p>

        <div className="mt-6 flex flex-col gap-5">
          <ChoiceGroup
            legend="Are you coming?"
            name="response"
            options={[
              { value: 'yes', label: 'Yes, I\u2019m going' },
              { value: 'no', label: 'Can\u2019t make it' },
            ]}
            value={response}
            onChange={(v) => setResponse(v as RsvpResponse)}
          />
          <Field label="Name">
            <input
              type="text"
              name="name"
              required
              autoComplete="name"
              defaultValue={initialName}
              placeholder="Your name"
              className={inputClass}
            />
          </Field>
          <Field label="Email" hint="(optional)">
            <input
              type="email"
              name="email"
              autoComplete="email"
              defaultValue={initialEmail}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
          {hasDinner && (
            <>
              <ChoiceGroup
                legend="Do you want dinner?"
                name="dinner"
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'No' },
                ]}
                value={dinner}
                onChange={(v) => setDinner(v as 'yes' | 'no')}
              />
              {dinner === 'yes' && (
                <ChoiceGroup
                  legend="What type of dinner?"
                  name="meal"
                  options={mealOptions.map((o) => ({ value: o, label: o }))}
                  value={meal}
                  onChange={setMeal}
                  columns={3}
                />
              )}
            </>
          )}
          <Field label="Anything we should know?" hint="(optional)">
            <textarea
              name="note"
              rows={3}
              defaultValue={initialNote}
              placeholder="Bringing the kids, dietary needs, arriving late…"
              className="mt-2 w-full resize-y rounded-xl border border-brand-black/10 bg-white px-4 py-3 text-base leading-relaxed text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold"
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-brand-black/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" aria-live="polite" className="text-sm font-medium text-brand-gold-deep">
            {saved && !error ? 'Saved.' : ''}
          </p>
          <Button type="submit" size="xl" variant="brand" disabled={busy} className="w-full sm:w-auto sm:px-8">
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>

      {/* Kept outside the <form> so nothing here can accidentally submit the edit. */}
      <div className="rounded-2xl border border-dashed border-brand-black/15 bg-white/60 p-6 sm:p-8">
        <h3 className="font-heading text-lg font-bold tracking-tight text-brand-black">Can&apos;t make it any more?</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-brand-grey">
          Cancelling takes you off the list for this date. You can always RSVP again later if plans change back.
        </p>

        {cancelError && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {cancelError}
          </p>
        )}

        {confirmingCancel ? (
          <div className="mt-5 flex flex-col gap-3 rounded-xl bg-brand-stone/70 p-4 ring-1 ring-brand-black/5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-brand-black">Are you sure? This can&apos;t be undone.</p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                size="xl"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmingCancel(false)}
                className="w-full sm:w-auto"
              >
                Keep my RSVP
              </Button>
              <Button
                type="button"
                size="xl"
                variant="danger"
                disabled={busy}
                onClick={onCancelConfirmed}
                className="w-full sm:w-auto"
              >
                {busy ? 'Cancelling…' : 'Yes, cancel my RSVP'}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingCancel(true)}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-lg border border-red-700/30 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:pointer-events-none disabled:opacity-50"
          >
            Cancel my RSVP
          </button>
        )}
      </div>
    </div>
  )
}
