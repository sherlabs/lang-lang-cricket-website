import 'server-only'
import type { TypedUser } from 'payload'
import { getPayloadClient } from '@/lib/payload/client'
import { isStaffUser } from '@/payload/access'
import { hit, type ThrottleRule } from '@/lib/throttle'
import { isGraphicType, isSizeKey, isStyleKey, type GraphicType, type RawParams, type SizeKey, type StyleKey } from './types'

/** Headers for every answer of these routes: private pictures and chooser lists are never cached or indexed. */
export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' } as const

/**
 * One identical answer for signed out, a selector, a disabled user, a bad type, a bad id and a graphic nobody may see, so the
 * routes reveal nothing about what exists (the selector preview route is the model).
 */
export const notFound = (): Response => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...PRIVATE_HEADERS } })

/** The signed-in committee member (admin or editor), or null. Never "any user": a selector is not staff. */
export async function staffUser(request: Request): Promise<TypedUser | null> {
  const payload = await getPayloadClient()
  const { user } = await payload.auth({ headers: request.headers })
  return isStaffUser(user) ? (user as TypedUser) : null
}

/** 300 renders per 10 minutes per person, a one-minute pause: stops a runaway loop, never a real session. */
export const RENDER_RULE: ThrottleRule = { limit: 300, windowMs: 600_000, lockMs: 60_000 }

export async function renderAllowed(userId: number | string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return hit(await getPayloadClient(), `social-render:${userId}`, RENDER_RULE)
}

export type CommonParams = { type: GraphicType; size: SizeKey; style: StyleKey | null; raw: RawParams }

/** Type is required; size defaults to square; style is optional (the club default). A present but unknown value is a 404, not a default. */
export function parseCommon(url: URL): CommonParams | null {
  const q = (k: string) => url.searchParams.get(k) ?? undefined
  const type = q('type')
  if (!isGraphicType(type)) return null
  const size = q('size') ?? 'square'
  if (!isSizeKey(size)) return null
  const style = q('style')
  if (style !== undefined && !isStyleKey(style)) return null
  const raw: RawParams = {}
  for (const k of ['source', 'text', 'game']) {
    const v = q(k)
    if (v !== undefined) raw[k] = v
  }
  return { type, size, style: style ?? null, raw }
}
