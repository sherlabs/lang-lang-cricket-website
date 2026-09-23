'use client'

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { UserIcon, Camera01Icon } from '@hugeicons/core-free-icons'
import { ImageCropperDialog } from '@/components/admin/image-cropper-dialog'
import { optimiseImage, uploadToBlob } from '@/lib/blob-client'

type Props = {
  name: string
  initialUrl?: string
}

/** Circular photo picker: pick a file, crop it to a square, upload, store the URL in a hidden field. */
export function PhotoUploadField({ name, initialUrl = '' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [photoUrl, setPhotoUrl] = useState(initialUrl)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setPendingFile(file)
    e.target.value = ''
  }

  async function onCropped(cropped: File) {
    setPendingFile(null)
    setBusy(true)
    try {
      const prepared = await optimiseImage(cropped, { maxEdge: 480 })
      setPhotoUrl(await uploadToBlob(prepared, 'contacts'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-stone text-brand-grey ring-1 ring-brand-black/10">
        {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <HugeiconsIcon icon={UserIcon} className="h-7 w-7" />}
      </span>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-9 w-fit items-center gap-1.5 rounded-md border border-brand-black/15 px-3 text-sm font-medium text-brand-black transition hover:border-brand-gold hover:bg-brand-gold-pale disabled:opacity-60"
        >
          <HugeiconsIcon icon={Camera01Icon} className="h-4 w-4" aria-hidden />
          {busy ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add photo'}
        </button>
        <p className="text-xs text-brand-grey">Optional. You&apos;ll be able to crop it to a square.</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <input type="hidden" name={name} value={photoUrl} readOnly />
      <ImageCropperDialog file={pendingFile} aspect={1} onCancel={() => setPendingFile(null)} onCropped={onCropped} />
    </div>
  )
}
