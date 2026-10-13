/**
 * The phone's share sheet (wave G spec WP-2a). It carries the rendered public picture and nothing else: never the draft caption,
 * hashtags, schedule, post id or any private field, because sharing leaves the app. `sharePayload` is the only place the object is
 * built, and a test asserts its exact shape.
 */
export type SharePayload = { files: File[]; title?: string }

export function sharePayload(file: File, title?: string): SharePayload {
  const t = (title ?? '').trim().slice(0, 100)
  return t ? { files: [file], title: t } : { files: [file] }
}

type ShareNav = { canShare?: (data?: { files?: File[] }) => boolean; share?: (data: SharePayload) => Promise<void> }

/** Whether this browser can share a picture file (hidden otherwise). */
export function canShareFile(nav: ShareNav | undefined, file: File): boolean {
  return Boolean(nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }))
}
