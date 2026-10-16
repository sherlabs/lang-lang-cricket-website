import 'server-only'
import type { ImageResponse } from 'next/og'
import { renderLoaded } from './pipeline'
import { GRAPHICS } from './registry'
import type { PostSpec } from './post-spec'
import type { SizeKey } from './types'

/** Draws a queued post's picture from its frozen snapshot, never from live data (wave C spec 4.4). Null when the snapshot cannot be used. */
export async function renderFromSpec(spec: PostSpec, size: SizeKey, headers: Record<string, string>): Promise<ImageResponse | null> {
  const g = GRAPHICS[spec.type]
  if (!g) return null
  const params = g.spec.parse(spec.raw)
  if (params === null || spec.snapshot?.data == null) return null
  return renderLoaded({ type: spec.type, params, data: spec.snapshot.data }, size, spec.style, headers)
}

/** Rendered to bytes, so a failure shows up now (the publisher checks once before it sends anything). */
export async function renderBytesFromSpec(spec: PostSpec, size: SizeKey): Promise<ArrayBuffer | null> {
  const res = await renderFromSpec(spec, size, {})
  return res ? res.arrayBuffer() : null
}
