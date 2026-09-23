'use client'

import { upload } from '@vercel/blob/client'

const BLOB_HOST = '.blob.vercel-storage.com'

export function isBlobUrl(url: string) {
  return url.includes(BLOB_HOST)
}

/**
 * Downscale an image in the browser so uploads stay small. Photos become JPEG;
 * logos (`keepAlpha`) become WebP/PNG so transparency survives. Anything the
 * browser can't decode (e.g. HEIC) is returned untouched.
 */
export async function optimiseImage(
  file: File,
  { maxEdge = 1600, keepAlpha = false, quality = 0.82 } = {}
): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const type = keepAlpha ? 'image/webp' : 'image/jpeg'
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality))
    if (!blob) return file
    // Safari can't encode WebP and silently returns PNG — honour whatever came back.
    const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg'
    const name = file.name.replace(/\.[^.]+$/, '') + '.' + ext
    return new File([blob], name, { type: blob.type })
  } catch {
    return file
  }
}

/** Upload straight from the browser to Vercel Blob under `prefix/` and return the public URL. Requires the admin session (routes through /api/admin/upload). */
export async function uploadToBlob(
  file: File,
  prefix: 'gallery' | 'sponsors' | 'documents' | 'stories'
): Promise<string> {
  const blob = await upload(`${prefix}/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/admin/upload',
  })
  return blob.url
}

/** Upload a story image with no admin session required (public submission form). */
export async function uploadPublicStoryImage(file: File): Promise<string> {
  const blob = await upload(`stories/pending/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/stories/upload',
  })
  return blob.url
}
