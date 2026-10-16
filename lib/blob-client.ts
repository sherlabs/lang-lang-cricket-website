'use client'

import { upload } from '@vercel/blob/client'

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

/**
 * Safe basename for a public upload (spec §6): `IMG 1234 (1).JPG` → `img-1234-1.jpg`. The
 * server's `isOwnBlobUrl` only accepts `[A-Za-z0-9._-]+` basenames, which phone filenames often
 * are not. Falls back to `image` when nothing usable is left.
 */
export function publicUploadName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const slug =
    stem
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'image'
  return ext ? `${slug}.${ext}` : slug
}

/**
 * Upload a story image (cover or inline) with no admin session required (public submission
 * and token edit forms). The route answers 503 when the site has no Blob store (local dev).
 */
export async function uploadPublicStoryImage(file: File): Promise<string> {
  const blob = await upload(`stories/pending/${publicUploadName(file.name)}`, file, {
    access: 'public',
    handleUploadUrl: '/api/public/stories/upload',
  })
  return blob.url
}

/**
 * Upload a publicly submitted event recap photo with no admin session required (see
 * app/(frontend)/events/[id]/actions.ts's submitEventPhoto). The route answers 503 when the
 * site has no Blob store (local dev), which surfaces as a thrown error here.
 */
export async function uploadPublicEventPhoto(file: File): Promise<string> {
  const blob = await upload(`events/pending/${publicUploadName(file.name)}`, file, {
    access: 'public',
    handleUploadUrl: '/api/public/events/upload',
  })
  return blob.url
}
