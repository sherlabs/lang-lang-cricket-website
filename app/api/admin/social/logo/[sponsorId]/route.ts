import { getPayloadClient } from '@/lib/payload/client'
import { sponsorLogo } from '@/lib/social/sources/logos'
import { notFound, PRIVATE_HEADERS, renderAllowed, staffUser } from '@/lib/social/staff'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET (committee only): a sponsor's logo as the PNG the pictures draw, for the thumbnails in the composer. The address takes a
 * sponsor id, never a media id, and reads that sponsor's own `logo` upload, so it cannot be used to read another file. Everything
 * that is not "a staff member asking for a sponsor whose logo can be drawn" answers with the same plain 404.
 */
export async function GET(request: Request, ctx: { params: Promise<{ sponsorId: string }> }): Promise<Response> {
  const actor = await staffUser(request)
  if (!actor) return notFound()
  const gate = await renderAllowed(actor.id)
  if (!gate.allowed) {
    return new Response('Slow down for a minute', { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': String(Math.max(1, gate.retryAfterSeconds)), ...PRIVATE_HEADERS } })
  }
  const { sponsorId } = await ctx.params
  if (!/^\d{1,9}$/.test(sponsorId) || Number(sponsorId) > 2147483647) return notFound()
  const payload = await getPayloadClient()
  const sponsor = await payload.findByID({ collection: 'sponsors', id: Number(sponsorId), depth: 1, overrideAccess: true, disableErrors: true })
  if (!sponsor) return notFound()
  const logo = await sponsorLogo(payload, sponsor.logo)
  if (!('dataUri' in logo)) return notFound()
  const body = Buffer.from(logo.dataUri.split(',')[1], 'base64')
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', ...PRIVATE_HEADERS } })
}
