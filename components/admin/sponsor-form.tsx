'use client'

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSponsor, updateSponsor, removeSponsor, type SponsorInput } from '@/app/admin/sponsors/actions'
import { TIERS } from '@/components/sponsor-logos'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'

type Props = { sponsor?: SponsorInput & { id: number } }

/** Create form when no sponsor is passed; edit + delete controls for an existing one. */
export function SponsorForm({ sponsor }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [tier, setTier] = useState(sponsor?.tier ?? 'Gold')
  const [name, setName] = useState(sponsor?.name ?? '')
  const [linkUrl, setLinkUrl] = useState(sponsor?.linkUrl ?? '')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    try {
      let logoUrl = sponsor?.logoUrl ?? ''
      const file = fileRef.current?.files?.[0]
      if (file) {
        setStatus('Uploading logo…')
        const prepared = await optimiseImage(file, { maxEdge: 1200, keepAlpha: true, quality: 0.9 })
        logoUrl = await uploadToBlob(prepared, 'sponsors')
      }
      const data = { tier, name, linkUrl, logoUrl }
      if (sponsor) {
        await updateSponsor(sponsor.id, data)
        setStatus('Saved.')
      } else {
        await createSponsor(data)
        setName('')
        setLinkUrl('')
        setStatus('Added.')
      }
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch (err) {
      setStatus(`Failed: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!sponsor) return
    setBusy(true)
    try {
      await removeSponsor(sponsor.id)
      router.refresh()
    } catch (err) {
      setStatus(`Failed: ${(err as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 text-sm">
      {sponsor && (
        <div className="flex h-24 items-center justify-center rounded bg-neutral-100 p-2">
          {sponsor.logoUrl ? (
            <img src={sponsor.logoUrl} alt={`${sponsor.name} logo`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-neutral-500">No logo yet</span>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="rounded border px-2 py-1" disabled={busy}>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          required
          className="min-w-0 flex-1 rounded border px-2 py-1"
          disabled={busy}
        />
      </div>
      <input
        value={linkUrl}
        onChange={(e) => setLinkUrl(e.target.value)}
        placeholder="Website (optional)"
        className="rounded border px-2 py-1"
        disabled={busy}
      />
      <label className="flex flex-col gap-1 text-xs text-neutral-600">
        {sponsor ? 'Replace logo' : 'Logo'}
        <input ref={fileRef} type="file" accept="image/*" required={!sponsor} disabled={busy} />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy} className="rounded bg-emerald-700 px-3 py-1 text-white disabled:opacity-50">
          {busy ? 'Working…' : sponsor ? 'Save' : 'Add sponsor'}
        </button>
        {sponsor && (
          <button type="button" onClick={onDelete} disabled={busy} className="text-xs text-red-600 hover:underline">
            Delete
          </button>
        )}
        {status && <span className="text-xs text-neutral-600">{status}</span>}
      </div>
    </form>
  )
}
