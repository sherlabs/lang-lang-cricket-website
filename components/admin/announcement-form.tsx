'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAnnouncement, updateAnnouncement, type AnnouncementInput } from '@/app/admin/(shell)/announcements/actions'
import { Field, TextArea, TextInput } from '@/components/admin/fields'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useDialogClose } from '@/components/admin/action-form'

type Props = { announcement?: AnnouncementInput & { id: number } }

/** Create form when no announcement is passed; edit form for an existing one (closes its dialog on save). */
export function AnnouncementForm({ announcement }: Props) {
  const router = useRouter()
  const close = useDialogClose()
  const [title, setTitle] = useState(announcement?.title ?? '')
  const [body, setBody] = useState(announcement?.body ?? '')
  const [published, setPublished] = useState(announcement?.published ?? false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const p = announcement ? `announcement-${announcement.id}` : 'announcement-new'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      const data = { title, body, published }
      if (announcement) {
        await updateAnnouncement(announcement.id, data)
      } else {
        await createAnnouncement(data)
        setTitle('')
        setBody('')
        setPublished(false)
        setStatus({ tone: 'ok', text: 'Announcement added.' })
      }
      router.refresh()
      close?.()
    } catch (err) {
      setStatus({ tone: 'error', text: `Failed: ${(err as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Title" htmlFor={`${p}-title`}>
        <TextInput id={`${p}-title`} value={title} onChange={(e) => setTitle(e.target.value)} required disabled={busy} />
      </Field>
      <Field label="Body" htmlFor={`${p}-body`} hint="Plain text. Line breaks are preserved.">
        <TextArea id={`${p}-body`} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={5} />
      </Field>
      <div className="flex items-center gap-2">
        <input
          id={`${p}-published`}
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          disabled={busy}
          className="h-5 w-5 rounded border border-brand-black/25 text-brand-gold focus:ring-brand-gold"
        />
        <Label htmlFor={`${p}-published`} className="text-brand-black">
          Published
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="xl" variant="brand" disabled={busy}>
          {busy ? 'Working…' : announcement ? 'Save changes' : 'Add announcement'}
        </Button>
        {status && (
          <p role="status" className={status.tone === 'error' ? 'text-sm text-red-700' : 'text-sm text-brand-grey'}>
            {status.text}
          </p>
        )}
      </div>
    </form>
  )
}
