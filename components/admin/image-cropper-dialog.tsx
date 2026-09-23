'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Props = {
  file: File | null
  aspect?: number
  onCancel: () => void
  onCropped: (file: File) => void
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function cropToFile(imageSrc: string, area: Area, fileName: string): Promise<File> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = area.width
  canvas.height = area.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')
  ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new Error('Could not crop image')
  return new File([blob], fileName.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/** Modal crop step between picking a file and uploading it. Square by default (for circular avatars). */
export function ImageCropperDialog({ file, aspect = 1, onCancel, onCropped }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  // Created once per file, not on every render — react-easy-crop treats a
  // changed `image` string as a brand-new image to (re)fetch, so recreating
  // this on every crop/zoom-driven re-render caused a runaway request loop.
  const objectUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  useEffect(() => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedArea(null)
  }, [file])

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels)
  }, [])

  async function confirm() {
    if (!file || !objectUrl || !croppedArea) return
    setBusy(true)
    try {
      const cropped = await cropToFile(objectUrl, croppedArea, file.name)
      onCropped(cropped)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg rounded-2xl bg-white p-6 text-brand-black shadow-card-hover ring-brand-black/10">
        <DialogHeader>
          <DialogTitle className="display text-2xl">Crop photo</DialogTitle>
        </DialogHeader>

        <div className="relative h-72 w-full overflow-hidden rounded-xl bg-brand-black">
          {objectUrl && (
            <Cropper
              image={objectUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-grey">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-brand-gold"
          />
        </div>

        <DialogFooter className="-mx-6 -mb-6 mt-6 border-brand-black/5 bg-brand-stone/60 p-6">
          <Button type="button" variant="outline" size="xl" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="brand" size="xl" onClick={confirm} disabled={busy || !croppedArea}>
            {busy ? 'Cropping…' : 'Use this photo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
