// @committee-facing
'use client'
/* eslint-disable @next/next/no-img-element -- the preview is a media-library file of any size and host */
import { useConfig, useField } from '@payloadcms/ui'
import { useEffect, useState } from 'react'
import { adminMediaSrc } from '../../lib/admin/list-status'

type Found = { url: string | null; filename: string | null; width?: number | null; height?: number | null }

/**
 * Under a picture field (`admin.components.afterInput`): a real preview of the chosen picture, so the committee sees what will be
 * published before saving. It reads the field's current value (the picked file or a saved one), so it updates when a new picture is
 * chosen and after saving. Payload's own Choose / Replace / Remove controls stay untouched.
 * `fit` "contain" suits logos.
 */
export function UploadPreview({ path, fit = 'cover', collection = 'media' }: { path?: string; fit?: 'cover' | 'contain'; collection?: string }) {
  const { value } = useField<number | string | { id: number | string } | null>({ path: path ?? '' })
  const { config } = useConfig()
  // The answer is stored with the id it belongs to, so a stale answer for a previous picture is never shown for a new one.
  const [result, setResult] = useState<{ id: string; found: Found | null } | null>(null)
  const id = value && typeof value === 'object' ? value.id : value
  const key = id == null || id === '' ? null : String(id)

  useEffect(() => {
    if (key == null) return
    const ctrl = new AbortController()
    // Same address as the page, never `serverURL`: the admin may be opened on a preview or local host that differs from it.
    const api = config.routes.api
    fetch(`${api}/${collection}/${encodeURIComponent(key)}?depth=0`, { credentials: 'include', signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Found) => setResult({ id: key, found: { url: adminMediaSrc(d.url, config.serverURL), filename: d.filename ?? null, width: d.width, height: d.height } }))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setResult({ id: key, found: null })
      })
    return () => ctrl.abort()
  }, [key, collection, config.routes.api, config.serverURL])

  const current = result && result.id === key ? result : null
  const found = current?.found ?? null
  const failed = current != null && current.found == null
  if (key == null) return <p className="club-uploadprev__none">No picture yet. Choose one above.</p>
  if (failed || !found?.url) return failed ? <p className="club-uploadprev__none">The picture could not be shown here, but it is attached.</p> : null
  return (
    <figure className="club-uploadprev" data-fit={fit}>
      <img src={found.url} alt="" />
      <figcaption>
        {found.filename}
        {found.width && found.height ? ` · ${found.width} × ${found.height}` : ''}
      </figcaption>
    </figure>
  )
}
