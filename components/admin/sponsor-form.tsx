'use client'

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSponsor, updateSponsor, type SponsorInput } from '@/app/admin/(shell)/sponsors/actions'
import { TIERS } from '@/components/sponsor-logos'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'
import { Field, FileInput, Select, TextInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'
import { useDialogClose } from '@/components/admin/action-form'

type Props = { sponsor?: SponsorInput & { id: number } }

/** Create form when no sponsor is passed; edit form for an existing one (closes its dialog on save). */
export function SponsorForm({ sponsor }: Props) {
  const router = useRouter()
  const close = useDialogClose()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tier, setTier] = useState(sponsor?.tier ?? 'Gold')
  const [name, setName] = useState(sponsor?.name ?? '')
  const [linkUrl, setLinkUrl] = useState(sponsor?.linkUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'busy'; text: string } | null>(null)
  const p = sponsor ? `sponsor-${sponsor.id}` : 'sponsor-new'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      let logoUrl = sponsor?.logoUrl ?? ''
      const file = fileRef.current?.files?.[0]
      if (file) {
        setStatus({ tone: 'busy', text: 'Uploading logo…' })
        const prepared = await optimiseImage(file, { maxEdge: 1200, keepAlpha: true, quality: 0.9 })
        logoUrl = await uploadToBlob(prepared, 'sponsors')
      }
      const data = { tier, name, linkUrl, logoUrl }
      if (sponsor) {
        await updateSponsor(sponsor.id, data)
      } else {
        await createSponsor(data)
        setName('')
        setLinkUrl('')
        setStatus({ tone: 'ok', text: 'Sponsor added.' })
      }
      if (fileRef.current) fileRef.current.value = ''
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
      {sponsor && (
        <div className="flex h-28 items-center justify-center rounded-lg bg-white p-3 ring-1 ring-brand-black/10">
          {sponsor.logoUrl ? (
            <img src={sponsor.logoUrl} alt={`${sponsor.name} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-brand-grey">No logo yet</span>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Field label="Tier" htmlFor={`${p}-tier`}>
          <Select id={`${p}-tier`} value={tier} onChange={(e) => setTier(e.target.value)} disabled={busy}>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor={`${p}-name`}>
          <TextInput id={`${p}-name`} value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
        </Field>
      </div>
      <Field label="Website" htmlFor={`${p}-link`} hint="Optional. The logo links here on the public site.">
        <TextInput
          id={`${p}-link`}
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://"
          disabled={busy}
        />
      </Field>
      <Field
        label={sponsor ? 'Replace logo' : 'Logo'}
        htmlFor={`${p}-logo`}
        hint={sponsor ? 'Leave empty to keep the current logo.' : 'PNG or SVG with a transparent background looks best. Resized in your browser before upload.'}
      >
        <FileInput id={`${p}-logo`} ref={fileRef} accept="image/*" required={!sponsor} disabled={busy} />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="xl" variant="brand" disabled={busy}>
          {busy ? 'Working…' : sponsor ? 'Save changes' : 'Add sponsor'}
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
